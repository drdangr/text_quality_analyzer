# Используем базовый образ NVIDIA CUDA, совместимый с вашей версией CUDA и PyTorch
# Пример для CUDA 12.1 и PyTorch (требует cudnn8)
# Актуальные теги смотрите на Docker Hub: https://hub.docker.com/r/nvidia/cuda
FROM nvidia/cuda:12.1.0-cudnn8-runtime-ubuntu22.04

# Устанавливаем рабочую директорию в контейнере
WORKDIR /app

# Устанавливаем переменные окружения для предотвращения интерактивных диалогов при установке
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

# Установка Python и pip, а также других необходимых системных зависимостей
# git нужен для установки некоторых python пакетов напрямую из репозиториев, если потребуется
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3.10 \
    python3-pip \
    python3-venv \
    git \
    && rm -rf /var/lib/apt/lists/*

# Копируем файл с зависимостями
COPY requirements.txt requirements.txt

# Обновляем pip и устанавливаем зависимости из requirements.txt
# Используем --no-cache-dir для уменьшения размера образа
# PyTorch будет установлен отдельно с нужной версией CUDA
RUN pip install --no-cache-dir --upgrade pip
# Временно удалим torch из requirements.txt, чтобы установить его отдельно ниже
# Или убедимся, что в requirements.txt torch указан без CPU/CUDA спецификатора
# RUN sed -i '/torch/d' requirements.txt # Удаляем строку с torch, если она там с конкретизацией
RUN pip install --no-cache-dir -r requirements.txt

# Устанавливаем PyTorch с поддержкой CUDA (версия должна соответствовать базовому образу)
# Пример для CUDA 12.1. Проверьте актуальную команду на сайте PyTorch.
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Копируем весь код приложения в рабочую директорию /app
COPY . .

# Создаем директории для логов и экспорта, если они не будут создаваться приложением при старте
# (в нашем случае main.py уже создает их, но для Docker это может быть полезно)
RUN mkdir -p logs exports && chmod -R 777 logs exports

# Указываем порт, который будет слушать приложение
EXPOSE 8000

# Команда для запуска приложения при старте контейнера
# Используем uvicorn напрямую, как рекомендуется для продакшена
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 