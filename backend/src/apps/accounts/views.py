from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import filters, permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from apps.core.permissions import (
    AdministrationPermission,
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)
from apps.core.query_params import parse_boolean_query_param

from .serializers import UserCreateSerializer, UserSerializer


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


class UserViewSet(viewsets.ModelViewSet):
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
