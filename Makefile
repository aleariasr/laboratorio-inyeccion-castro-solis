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
	$(BACKEND) test apps.accounts apps.core apps.inventory apps.customers apps.sales

test-inventory:
	$(BACKEND) test apps.inventory

test-core:
	$(BACKEND) test apps.core

test-customers:
	$(BACKEND) test apps.customers

test-sales:
	$(BACKEND) test apps.sales

test-accounts:
	$(BACKEND) test apps.accounts

run:
	$(BACKEND) runserver 0.0.0.0:8000