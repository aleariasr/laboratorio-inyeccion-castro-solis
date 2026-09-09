from django.contrib import admin

from .models import (
    LegacyRecordMap,
    LegacyStagingRecord,
    MigrationIssue,
    MigrationRun,
)


@admin.register(MigrationRun)
class MigrationRunAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "started_at", "finished_at", "created_by")
    list_filter = ("status",)
    ordering = ("-created_at",)


@admin.register(LegacyStagingRecord)
class LegacyStagingRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "run", "source_table", "source_origin", "source_key")
    list_filter = ("source_table", "source_origin", "run")
    search_fields = ("source_key",)


@admin.register(MigrationIssue)
class MigrationIssueAdmin(admin.ModelAdmin):
    list_display = ("id", "run", "severity", "category", "source_table", "source_key")
    list_filter = ("severity", "category", "source_table", "run")
    search_fields = ("source_key", "message")


@admin.register(LegacyRecordMap)
class LegacyRecordMapAdmin(admin.ModelAdmin):
    list_display = ("id", "run", "source_table", "source_key", "target_model", "target_id")
    list_filter = ("source_table", "target_model", "run")
    search_fields = ("source_key",)
