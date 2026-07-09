from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from apps.customers.exceptions import (
    CustomerAlreadyExistsError,
    InjectorAlreadyExistsError,
)
from apps.customers.models import Customer, Injector
from apps.customers.selectors import customer_search
from apps.customers.serializers import (
    CustomerSerializer,
    InjectorSerializer,
)
from apps.customers.services import (
    register_customer,
    register_injector,
)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Customer.objects.order_by("display_name")

        query = self.request.query_params.get("q", "").strip()

        if query:
            return customer_search(query)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        try:
            customer = register_customer(
                customer_type=serializer.validated_data["customer_type"],
                display_name=serializer.validated_data["display_name"],
                identification=serializer.validated_data.get(
                    "identification",
                    "",
                ),
                phone=serializer.validated_data.get(
                    "phone",
                    "",
                ),
                email=serializer.validated_data.get(
                    "email",
                    "",
                ),
                notes=serializer.validated_data.get(
                    "notes",
                    "",
                ),
                user=request.user,
            )
        except CustomerAlreadyExistsError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_serializer = self.get_serializer(customer)

        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )


class InjectorViewSet(viewsets.ModelViewSet):
    serializer_class = InjectorSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = (
            Injector.objects.select_related("customer")
            .order_by("injector_number")
        )

        customer_id = self.request.query_params.get("customer")

        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        try:
            injector = register_injector(
                customer=serializer.validated_data["customer"],
                injector_number=serializer.validated_data["injector_number"],
                description=serializer.validated_data.get(
                    "description",
                    "",
                ),
                notes=serializer.validated_data.get(
                    "notes",
                    "",
                ),
                user=request.user,
            )
        except InjectorAlreadyExistsError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_serializer = self.get_serializer(injector)

        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )