from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from apps.core.permissions import (
    ROLE_ADMIN,
    ROLE_CUSTOMERS,
    ROLE_INVENTORY,
    ROLE_READ_ONLY,
    ROLE_SALES,
)


class Command(BaseCommand):
    help = "Create base application roles."

    def handle(self, *args, **options):
        roles = [
            ROLE_ADMIN,
            ROLE_INVENTORY,
            ROLE_SALES,
            ROLE_CUSTOMERS,
            ROLE_READ_ONLY,
        ]

        created_count = 0

        for role in roles:
            _, created = Group.objects.get_or_create(
                name=role,
            )

            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Created role: {role}"
                    )
                )
            else:
                self.stdout.write(
                    f"Role already exists: {role}"
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Roles ready. Created: {created_count}. Total: {len(roles)}."
            )
        )