from django.contrib.auth.models import Group, User
from rest_framework import serializers

from apps.core.permissions import ROLE_ADMIN


class UserSerializer(serializers.ModelSerializer):
    groups = serializers.SlugRelatedField(
        many=True,
        slug_field="name",
        queryset=Group.objects.all(),
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
        )

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
