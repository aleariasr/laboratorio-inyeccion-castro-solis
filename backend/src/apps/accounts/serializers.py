from django.contrib.auth.models import Group, Permission, User
from rest_framework import serializers

from apps.core.permissions import ROLE_ADMIN

# Permisos de módulo individuales (apps/core/models.py:ModulePermissions).
# Se exponen tal cual junto a "groups": Django resuelve user.has_perm()
# como la unión de user_permissions + los permisos de los grupos del
# usuario (ver ModulePermission.has_permission en
# apps/core/permissions.py), así que un usuario puede tener acceso por
# rol, por permiso individual, o ambos a la vez.
MODULE_PERMISSIONS_QUERYSET = Permission.objects.filter(
    content_type__app_label="core",
    content_type__model="modulepermissions",
)


class UserSerializer(serializers.ModelSerializer):
    groups = serializers.SlugRelatedField(
        many=True,
        slug_field="name",
        queryset=Group.objects.all(),
    )
    permissions = serializers.SlugRelatedField(
        many=True,
        slug_field="codename",
        source="user_permissions",
        queryset=MODULE_PERMISSIONS_QUERYSET,
        required=False,
    )

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "is_active",
            "is_staff",
            "is_superuser",
            "groups",
            "permissions",
        )
        read_only_fields = (
            "is_superuser",
        )

    def validate(self, attrs):
        request = self.context.get("request")

        if (
            self.instance is not None
            and request is not None
            and self.instance == request.user
        ):
            if attrs.get("is_active") is False:
                raise serializers.ValidationError(
                    {
                        "is_active": [
                            "No puede desactivar su propio usuario.",
                        ]
                    }
                )

            groups = attrs.get("groups")

            if (
                groups is not None
                and self.instance.groups.filter(name=ROLE_ADMIN).exists()
                and not any(group.name == ROLE_ADMIN for group in groups)
            ):
                raise serializers.ValidationError(
                    {
                        "groups": [
                            "No puede quitarse su propio rol de administrador.",
                        ]
                    }
                )

        return attrs


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    groups = serializers.SlugRelatedField(
        many=True,
        slug_field="name",
        queryset=Group.objects.all(),
        required=False,
    )
    permissions = serializers.SlugRelatedField(
        many=True,
        slug_field="codename",
        source="user_permissions",
        queryset=MODULE_PERMISSIONS_QUERYSET,
        required=False,
    )

    class Meta:
        model = User
        fields = (
            "username",
            "password",
            "first_name",
            "last_name",
            "email",
            "is_active",
            "is_staff",
            "groups",
            "permissions",
        )

    def create(self, validated_data):
        password = validated_data.pop("password")
        groups = validated_data.pop("groups", [])
        individual_permissions = validated_data.pop("user_permissions", [])

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        if groups:
            user.groups.set(groups)

        if individual_permissions:
            user.user_permissions.set(individual_permissions)

        return user
