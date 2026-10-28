from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import filters, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from apps.core.deletion import ProtectedDeleteMixin
from apps.core.permissions import (
    AdministrationPermission,
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.core.query_params import parse_boolean_query_param

from .serializers import (
    ChangeOwnPasswordSerializer,
    SetPasswordSerializer,
    UserCreateSerializer,
    UserSerializer,
)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        user = authenticate(
            username=username,
            password=password,
        )

        if user is None:
            return Response(
                {"detail": "Credenciales inválidas."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        token, _ = Token.objects.get_or_create(user=user)

        return Response(
            {
                "token": token.key,
                "user": UserSerializer(user).data,
            }
        )


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request.user.auth_token.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class RoleListView(APIView):
    """
    Lista los roles base del sistema (ver ROLE_PERMISSIONS en
    apps/core/management/commands/setup_roles.py). Es una lista fija,
    no una consulta a Group: los roles del negocio son ese conjunto
    cerrado de 5, no cualquier Group que exista en la base.
    """

    permission_classes = [AdministrationPermission]

    ROLES = [
        ROLE_ADMIN,
        ROLE_INVENTORY,
        ROLE_SALES,
        ROLE_CUSTOMERS,
        ROLE_READ_ONLY,
    ]

    def get(self, request):
        return Response({"results": self.ROLES})


class UserViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    permission_classes = [AdministrationPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["username", "first_name", "last_name"]
    ordering = ["username"]

    def get_queryset(self):
        queryset = User.objects.order_by("username")

        query = self.request.query_params.get("q", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"), name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(username__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
                | Q(email__icontains=query)
            )

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        return queryset

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer

        return UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        return Response(
            UserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()

        if instance == request.user:
            raise PermissionDenied(
                "No puede eliminar su propio usuario.",
            )

        return super().destroy(request, *args, **kwargs)

    @action(
        detail=True,
        methods=["post"],
        url_path="set-password",
    )
    def set_password(self, request, pk=None):
        """
        Restablece la contraseña de otro usuario (para cuando la olvidó).

        Cierra las sesiones de esa persona borrando su token: DRF usa un
        token por usuario, así que queda fuera en todas las máquinas y
        tiene que entrar con la contraseña nueva.
        """

        user = self.get_object()

        if user == request.user:
            raise PermissionDenied(
                "Para cambiar su propia contraseña use "
                "\"Cambiar mi contraseña\", que pide la actual.",
            )

        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user.set_password(
            serializer.validated_data["password"],
        )
        user.save(update_fields=["password"])

        Token.objects.filter(user=user).delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangeOwnPasswordView(APIView):
    """
    Cambio de la propia contraseña. Devuelve un token nuevo para que la
    persona siga trabajando donde estaba, mientras cualquier otra sesión
    abierta con el token viejo queda cerrada.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangeOwnPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user

        if not user.check_password(
            serializer.validated_data["current_password"],
        ):
            return Response(
                {
                    "current_password": [
                        "La contraseña actual no es correcta.",
                    ],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(
            serializer.validated_data["new_password"],
        )
        user.save(update_fields=["password"])

        Token.objects.filter(user=user).delete()
        token = Token.objects.create(user=user)

        return Response({"token": token.key})
