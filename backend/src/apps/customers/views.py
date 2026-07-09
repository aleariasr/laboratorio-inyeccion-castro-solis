from rest_framework import permissions, status, viewsets
from rest_framework.response import Response

from apps.customers.exceptions import CustomerAlreadyExistsError
from apps.customers.models import Customer
from apps.customers.selectors import customer_search
from apps.customers.serializers import CustomerSerializer
from apps.customers.services import register_customer


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