from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.customers.exceptions import (
    CustomerAlreadyExistsError,
    InjectorAlreadyExistsError,
    InvalidServiceTransitionError,
)
from apps.customers.models import (
    Customer,
    Injector,
    InjectorAccessory,
    InjectorServiceRecord,
)
from apps.customers.selectors import customer_search

from apps.customers.serializers import (
    CustomerSerializer,
    InjectorAccessorySerializer,
    InjectorSerializer,
    InjectorServiceAccessorySerializer,
    InjectorServiceRecordSerializer,
)
from apps.customers.services import (
    cancel_service,
    deliver_service,
    mark_ready,
    receive_injector,
    register_customer,
    register_injector,
    start_service,
)

from apps.customers.models import (
    Customer,
    Injector,
    InjectorAccessory,
    InjectorServiceAccessory,
    InjectorServiceRecord,
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


class InjectorServiceRecordViewSet(viewsets.ModelViewSet):
    serializer_class = InjectorServiceRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = (
            InjectorServiceRecord.objects.select_related(
                "injector",
                "injector__customer",
            )
            .order_by(
                "-received_at",
                "-id",
            )
        )

        injector_id = self.request.query_params.get("injector")
        customer_id = self.request.query_params.get("customer")
        status_value = self.request.query_params.get("status")

        if injector_id:
            queryset = queryset.filter(injector_id=injector_id)

        if customer_id:
            queryset = queryset.filter(injector__customer_id=customer_id)

        if status_value:
            queryset = queryset.filter(status=status_value)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        service_record = receive_injector(
            injector=serializer.validated_data["injector"],
            received_at=serializer.validated_data["received_at"],
            user=request.user,
        )

        output_serializer = self.get_serializer(service_record)

        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="start",
    )
    def start(self, request, pk=None):
        service_record = self.get_object()

        try:
            service_record = start_service(
                service_record=service_record,
                user=request.user,
            )
        except InvalidServiceTransitionError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(service_record)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="mark-ready",
    )
    def mark_ready(self, request, pk=None):
        service_record = self.get_object()

        try:
            service_record = mark_ready(
                service_record=service_record,
                user=request.user,
            )
        except InvalidServiceTransitionError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(service_record)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="deliver",
    )
    def deliver(self, request, pk=None):
        service_record = self.get_object()

        delivered_at = request.data.get("delivered_at")

        if delivered_at:
            delivered_at_serializer = self.get_serializer(
                service_record,
                data={
                    "delivered_at": delivered_at,
                },
                partial=True,
            )
            delivered_at_serializer.is_valid(
                raise_exception=True,
            )
            delivered_at = delivered_at_serializer.validated_data.get(
                "delivered_at",
                timezone.now(),
            )
        else:
            delivered_at = timezone.now()

        try:
            service_record = deliver_service(
                service_record=service_record,
                delivered_at=delivered_at,
                user=request.user,
            )
        except InvalidServiceTransitionError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(service_record)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="cancel",
    )
    def cancel(self, request, pk=None):
        service_record = self.get_object()

        try:
            service_record = cancel_service(
                service_record=service_record,
                user=request.user,
            )
        except InvalidServiceTransitionError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(service_record)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


class InjectorAccessoryViewSet(viewsets.ModelViewSet):
    queryset = InjectorAccessory.objects.order_by("name")
    serializer_class = InjectorAccessorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )

class InjectorServiceAccessoryViewSet(viewsets.ModelViewSet):
    serializer_class = InjectorServiceAccessorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = (
            InjectorServiceAccessory.objects
            .select_related(
                "service_record",
                "service_record__injector",
                "service_record__injector__customer",
                "accessory",
            )
            .order_by("-created_at", "-id")
        )

        service_record_id = self.request.query_params.get("service_record")

        if service_record_id:
            queryset = queryset.filter(service_record_id=service_record_id)

        return queryset

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            updated_by=self.request.user,
        )

    def perform_update(self, serializer):
        serializer.save(
            updated_by=self.request.user,
        )