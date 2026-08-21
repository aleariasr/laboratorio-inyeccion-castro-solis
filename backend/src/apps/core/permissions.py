from rest_framework import permissions


ROLE_ADMIN = "ADMIN"
ROLE_INVENTORY = "INVENTORY"
ROLE_SALES = "SALES"
ROLE_CUSTOMERS = "CUSTOMERS"
ROLE_READ_ONLY = "READ_ONLY"


class AdministrationPermission(permissions.BasePermission):
    message = "No tiene permisos para consultar esta información."

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or user.is_staff:
            return True

        return user.groups.filter(name=ROLE_ADMIN).exists()


class ModulePermission(permissions.BasePermission):
    """
    Permiso basado en los permisos de módulo declarados en
    ModulePermissions (ver apps/core/models.py).

    Cada subclase define:

    - module: el prefijo usado en los permisos del módulo (ej.
      "purchases" para view_purchases / add_purchases /
      change_purchases / cancel_purchases).
    - cancel_actions: nombres de @action de un ViewSet que deben
      exigir "cancel_<module>" en vez de "change_<module>" (ej.
      "cancel" en Purchase, Sale, InventoryCount,
      InjectorServiceRecord).
    - read_actions: nombres de @action que son de solo lectura pero
      están implementadas con un método HTTP no seguro (ej. "labels",
      que genera un PDF con POST). Sin esto se exigiría por error
      "change_<module>" en vez de "view_<module>".

    Superusuarios y miembros del grupo ADMIN pasan siempre. A
    diferencia del esquema anterior, is_staff por sí solo YA NO da
    acceso a los módulos de negocio: is_staff solo controla el acceso
    al panel /admin/ de Django. Ver AdministrationPermission para el
    control de quién administra usuarios.

    Resolución del permiso exacto, en este orden:

    1. La acción está en cancel_actions -> cancel_<module>.
    2. La acción está en read_actions -> view_<module>.
    3. La acción es "create" -> add_<module>.
    4. El método HTTP es seguro (GET/HEAD/OPTIONS) -> view_<module>.
       Cubre "list", "retrieve" y cualquier @action de solo lectura
       (ej. "cost_summary") sin tener que enumerarlas.
    5. Cualquier otro caso -> change_<module>. Cubre "update",
       "partial_update", "destroy" y las @action que mutan estado sin
       ser cancelación (ej. "confirm", "approve", "start",
       "mark_ready", "deliver", "calculate_costs").
    """

    app_label = "core"
    module = None
    cancel_actions = frozenset()
    read_actions = frozenset()

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if user.is_superuser:
            return True

        if user.groups.filter(name=ROLE_ADMIN).exists():
            return True

        return user.has_perm(
            f"{self.app_label}.{self._codename(request, view)}"
        )

    def _codename(self, request, view):
        action = getattr(view, "action", None)

        if action in self.cancel_actions:
            return f"cancel_{self.module}"

        if action in self.read_actions:
            return f"view_{self.module}"

        if action == "create":
            return f"add_{self.module}"

        if request.method in permissions.SAFE_METHODS:
            return f"view_{self.module}"

        return f"change_{self.module}"


class ProductsPermission(ModulePermission):
    module = "products"
    read_actions = frozenset({"labels"})


class LocationsPermission(ModulePermission):
    module = "locations"
    read_actions = frozenset({"labels"})


class SuppliersPermission(ModulePermission):
    module = "suppliers"


class PurchasesPermission(ModulePermission):
    module = "purchases"
    cancel_actions = frozenset({"cancel"})


class InventoryCountsPermission(ModulePermission):
    module = "inventory_counts"
    cancel_actions = frozenset({"cancel"})


class SalesPermission(ModulePermission):
    module = "sales"
    cancel_actions = frozenset({"cancel"})


class CustomersPermission(ModulePermission):
    module = "customers"


class InjectorsPermission(ModulePermission):
    module = "injectors"


class ServicesPermission(ModulePermission):
    module = "services"
    cancel_actions = frozenset({"cancel"})


class ReportsPermission(ModulePermission):
    module = "reports"


class DocumentsPermission(ModulePermission):
    module = "documents"


class MovementsPermission(ModulePermission):
    module = "movements"
