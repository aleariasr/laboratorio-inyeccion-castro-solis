from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_alter_modulepermissions_options'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='modulepermissions',
            options={
                'default_permissions': (),
                'managed': False,
                'permissions': [
                    ('view_products', 'Productos: ver'),
                    ('add_products', 'Productos: crear'),
                    ('change_products', 'Productos: editar'),
                    ('view_locations', 'Ubicaciones: ver'),
                    ('add_locations', 'Ubicaciones: crear'),
                    ('change_locations', 'Ubicaciones: editar'),
                    ('view_suppliers', 'Proveedores: ver'),
                    ('add_suppliers', 'Proveedores: crear'),
                    ('change_suppliers', 'Proveedores: editar'),
                    ('view_purchases', 'Compras: ver'),
                    ('add_purchases', 'Compras: crear'),
                    ('change_purchases', 'Compras: editar'),
                    ('cancel_purchases', 'Compras: cancelar'),
                    ('view_inventory_counts', 'Conteos físicos: ver'),
                    ('add_inventory_counts', 'Conteos físicos: crear'),
                    ('change_inventory_counts', 'Conteos físicos: editar'),
                    ('cancel_inventory_counts', 'Conteos físicos: cancelar'),
                    ('view_sales', 'Ventas: ver'),
                    ('add_sales', 'Ventas: crear'),
                    ('change_sales', 'Ventas: editar'),
                    ('cancel_sales', 'Ventas: cancelar'),
                    ('view_customers', 'Clientes: ver'),
                    ('add_customers', 'Clientes: crear'),
                    ('change_customers', 'Clientes: editar'),
                    ('view_injectors', 'Inyectores: ver'),
                    ('add_injectors', 'Inyectores: crear'),
                    ('change_injectors', 'Inyectores: editar'),
                    ('view_services', 'Servicios: ver'),
                    ('add_services', 'Servicios: crear'),
                    ('change_services', 'Servicios: editar'),
                    ('cancel_services', 'Servicios: cancelar'),
                    ('view_reports', 'Reportes: ver'),
                    ('view_documents', 'Documentos: ver'),
                    ('add_documents', 'Documentos: crear'),
                    ('view_movements', 'Movimientos de inventario: ver'),
                    ('view_cash', 'Caja: ver'),
                    ('add_cash', 'Caja: crear'),
                ],
            },
        ),
    ]
