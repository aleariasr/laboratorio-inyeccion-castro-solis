FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements/base.txt .

RUN pip install --no-cache-dir -r base.txt

COPY . .

EXPOSE 8000

CMD ["bash"]