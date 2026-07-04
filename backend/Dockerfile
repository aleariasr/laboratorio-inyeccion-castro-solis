FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements/base.txt .

RUN pip install --no-cache-dir -r base.txt

COPY src .

EXPOSE 8000