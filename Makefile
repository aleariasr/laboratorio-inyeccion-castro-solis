COMPOSE=docker compose -f infra/docker/compose.yml
BACKEND=$(COMPOSE) exec backend python src/manage.py

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

start:
	$(COMPOSE) start

stop:
	$(COMPOSE) stop

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

shell:
	$(COMPOSE) exec backend bash

db:
	$(COMPOSE) exec postgres psql -U lics -d lics

migrate:
	$(BACKEND) migrate

makemigrations:
	$(BACKEND) makemigrations

check:
	$(BACKEND) check

test:
	$(BACKEND) test --buffer apps.accounts apps.core apps.inventory apps.customers apps.sales apps.configuration apps.documents apps.cash apps.legacy_migration

test-inventory:
	$(BACKEND) test --buffer apps.inventory

test-core:
	$(BACKEND) test --buffer apps.core

test-customers:
	$(BACKEND) test --buffer apps.customers

test-sales:
	$(BACKEND) test --buffer apps.sales

test-accounts:
	$(BACKEND) test --buffer apps.accounts

test-configuration:
	$(BACKEND) test --buffer apps.configuration

test-documents:
	$(BACKEND) test --buffer apps.documents

test-cash:
	$(BACKEND) test --buffer apps.cash

test-legacy-migration:
	$(BACKEND) test --buffer apps.legacy_migration

run:
	$(BACKEND) runserver 0.0.0.0:8000
release:
	./scripts/build-offline-release.sh