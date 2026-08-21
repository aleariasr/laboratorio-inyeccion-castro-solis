from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import (
    AdministrationPermission,
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)

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
    queryset = User.objects.order_by("username")
    permission_classes = [AdministrationPermission]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer

        return UserSerializer
