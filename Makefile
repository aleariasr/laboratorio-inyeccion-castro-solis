COMPOSE=docker compose -f infra/docker/compose.yml

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
	$(COMPOSE) exec backend python src/manage.py migrate

makemigrations:
	$(COMPOSE) exec backend python src/manage.py makemigrations

check:
	$(COMPOSE) exec backend python src/manage.py check

run:
	$(COMPOSE) exec backend python src/manage.py runserver 0.0.0.0:8000