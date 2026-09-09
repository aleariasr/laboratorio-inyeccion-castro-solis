from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework import filters, mixins, status, viewsets

from apps.core.permissions import (
    CustomersPermission,
    InjectorsPermission,
    ServicesPermission,
)
from apps.core.query_params import (
    parse_boolean_query_param,
    parse_date_query_param,
)

from apps.customers.exceptions import (
    CustomerAlreadyExistsError,
    InjectorAlreadyExistsError,
    InsufficientStockForServiceError,
    InvalidServiceTransitionError,
    ServiceMissingPriceError,
    ServiceNotEditableError,
)
from apps.customers.models import (
    Customer,
    Injector,
    InjectorServiceRecord,
)

from apps.customers.serializers import (
    CustomerSerializer,
    InjectorSerializer,
    InjectorServiceAccessorySerializer,
    InjectorServiceRecordSerializer,
    ServiceTypePriceHistorySerializer,
    ServiceTypeSerializer,
)
from apps.customers.services import (
    add_service_accessory,
    cancel_service,
    deliver_service,
    mark_ready,
    receive_injector,
    register_customer,
    register_injector,
    remove_service_accessory,
    start_service,
    sync_service_type_price_history,
)

from apps.customers.models import (
    Customer,
    Injector,
    InjectorServiceAccessory,
    InjectorServiceRecord,
    ServiceType,
    ServiceTypePriceHistory,
)


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [CustomersPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["display_name", "created_at"]
    ordering = ["display_name"]

    def get_queryset(self):
        queryset = Customer.objects.all()

        query = self.request.query_params.get("q", "").strip()
        customer_type = self.request.query_params.get("customer_type", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"), name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(display_name__icontains=query)
                | Q(identification__icontains=query)
                | Q(phone__icontains=query)
                | Q(email__icontains=query)
            )

        if customer_type:
            queryset = queryset.filter(customer_type=customer_type.upper())

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

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
    permission_classes = [InjectorsPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["injector_number", "created_at"]
    ordering = ["injector_number"]

    def get_queryset(self):
        queryset = Injector.objects.select_related("customer")

        query = self.request.query_params.get("q", "").strip()
        customer_id = self.request.query_params.get("customer")
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"), name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(injector_number__icontains=query)
                | Q(customer__display_name__icontains=query)
            )

        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

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
    permission_classes = [ServicesPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["received_at", "delivered_at", "status", "created_at"]
    ordering = ["-received_at", "-id"]

    def get_queryset(self):
        queryset = InjectorServiceRecord.objects.select_related(
            "injector",
            "injector__customer",
        )

        query = self.request.query_params.get("q", "").strip()
        injector_id = self.request.query_params.get("injector")
        customer_id = self.request.query_params.get("customer")
        status_value = self.request.query_params.get("status", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"), name="is_active",
        )
        received_from = parse_date_query_param(
            self.request.query_params.get("received_from"), name="received_from",
        )
        received_to = parse_date_query_param(
            self.request.query_params.get("received_to"), name="received_to",
        )

        if received_from and received_to and received_from > received_to:
            raise ValidationError(
                {"received_to": ["received_to no puede ser anterior a received_from."]}
            )

        if query:
            queryset = queryset.filter(
                Q(injector__injector_number__icontains=query)
                | Q(injector__customer__display_name__icontains=query)
            )

        if injector_id:
            queryset = queryset.filter(injector_id=injector_id)

        if customer_id:
            queryset = queryset.filter(injector__customer_id=customer_id)

        if status_value:
            queryset = queryset.filter(status=status_value.upper())

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        if received_from:
            queryset = queryset.filter(received_at__date__gte=received_from)

        if received_to:
            queryset = queryset.filter(received_at__date__lte=received_to)

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
        service_record = serializer.save(
            updated_by=self.request.user,
        )

        sync_service_type_price_history(
            service_record=service_record,
            user=self.request.user,
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
        except (
            InvalidServiceTransitionError,
            ServiceMissingPriceError,
        ) as exc:
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


class ServiceTypeViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceTypeSerializer
    permission_classes = [ServicesPermission]
    filter_backends = [filters.OrderingFilter]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]

    def get_queryset(self):
        queryset = ServiceType.objects.all()

        query = self.request.query_params.get("q", "").strip()
        is_active = parse_boolean_query_param(
            self.request.query_params.get("is_active"), name="is_active",
        )

        if query:
            queryset = queryset.filter(
                Q(name__icontains=query) | Q(description__icontains=query)
            )

        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

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


class ServiceTypePriceHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ServiceTypePriceHistorySerializer
    permission_classes = [ServicesPermission]

    def get_queryset(self):
        queryset = (
            ServiceTypePriceHistory.objects
            .select_related("service_type", "service_record")
            .order_by("-charged_at", "-id")
        )

        service_type_id = self.request.query_params.get("service_type")

        if service_type_id:
            queryset = queryset.filter(service_type_id=service_type_id)

        return queryset


class InjectorServiceAccessoryViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Sin PATCH/PUT a propósito: el producto y la cantidad no se pueden editar
    una vez creado (ya descontó inventario) — se elimina la línea (revierte
    el movimiento) y se crea una nueva si hace falta cambiarla.
    """

    serializer_class = InjectorServiceAccessorySerializer
    permission_classes = [ServicesPermission]

    def get_queryset(self):
        queryset = (
            InjectorServiceAccessory.objects
            .select_related(
                "service_record",
                "service_record__injector",
                "service_record__injector__customer",
                "product",
            )
            .order_by("-created_at", "-id")
        )

        service_record_id = self.request.query_params.get("service_record")

        if service_record_id:
            queryset = queryset.filter(service_record_id=service_record_id)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            service_accessory = add_service_accessory(
                service_record=serializer.validated_data["service_record"],
                product=serializer.validated_data["product"],
                quantity=serializer.validated_data["quantity"],
                notes=serializer.validated_data.get("notes", ""),
                user=request.user,
            )
        except (
            ServiceNotEditableError,
            InsufficientStockForServiceError,
        ) as exc:
            return Response(
                {"detail": str(exc) or exc.__class__.__name__},
                status=status.HTTP_400_BAD_REQUEST,
            )

        output_serializer = self.get_serializer(service_accessory)

        return Response(
            output_serializer.data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        service_accessory = self.get_object()

        try:
            remove_service_accessory(
                service_accessory=service_accessory,
                user=request.user,
            )
        except ServiceNotEditableError as exc:
            return Response(
                {"detail": str(exc) or exc.__class__.__name__},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)