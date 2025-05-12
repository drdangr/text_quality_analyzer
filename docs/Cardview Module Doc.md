# Модуль: CardView – визуализация абзацев как карточек

## Назначение

Модуль `CardView` предназначен для визуального отображения абзацев текста в виде вертикально расположенных карточек. Используется для быстрой навигации и взаимодействия с результатами текстового анализа или черновыми текстами (например, отрывками глав, размеченными параграфами, выводами анализа).

Первая цель модуля — построение вертикального списка карточек из CSV- или JSON-файла с колонкой `text`.

## Архитектура приложения

Модуль реализуется как отдельное React-приложение, которое получает данные из Python-скрипта или сервера. Взаимодействие между визуализатором и аналитической частью Дживса может быть реализовано в нескольких режимах:

### Режимы связи

- 📁 Через локальный CSV/JSON (MVP-режим);
    
- 🌐 Через REST API на базе FastAPI (расширенный режим);
    
- 🔄 Через WebSocket для интерактивного взаимодействия (в будущем).
    

## Каркас API на FastAPI

Для интеграции с React-модулем можно использовать FastAPI — современный Python-фреймворк для создания быстрых и типизированных REST API.

### Установка

```
pip install fastapi uvicorn pandas
```

### Пример сервера `main.py`

```
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
import pandas as pd

app = FastAPI()

class Paragraph(BaseModel):
    paragraph_id: int
    text: str
    signal_strength: float
    complexity: float

@app.get("/paragraphs", response_model=List[Paragraph])
def get_paragraphs():
    df = pd.read_csv("analysis_results.csv")
    return df.to_dict(orient="records")
```

### Запуск сервера

```
uvicorn main:app --reload
```

После запуска будет доступно:

- API: http://localhost:8000/paragraphs
    
- Документация: http://localhost:8000/docs
    

## Текущий статус (MVP)

- Загрузка текста из массива объектов (например, из CSV);
    
- Визуализация как вертикальный список карточек;
    
- Каждая карточка содержит `text`, `paragraph_id`;
    
- Цвет фона и текста пока фиксированы;
    
- Расположение карточек — вертикальное, прокручиваемое поле.
    

## Планируемое расширение

- Альтернативная визуализация `signal_strength`, `complexity` (например, цветные полосы, иконки);
    
- Ручная настройка шрифта, цвета, размера, фона (min/max), динамически через UI;
    
- Сворачивание карточек в summary;
    
- Inline-редактирование текста;
    
- Перетаскивание карточек (drag-and-drop);
    
- Отображение стрелочных связей (React Flow или D3);
    
- Группировка и фильтрация по семантическим признакам;
    
- Поддержка сохранения состояния (позиции, цвета и т.д.);
    
- Интеграция с Jeeves-аналитикой (двусторонняя).
    

## Формат входных данных

```
[
  {
    "paragraph_id": 0,
    "text": "онтологическая геометрия",
    "signal_strength": 0.788,
    "complexity": 1.000
  },
  ...
]
```

## Технологический стек

- React
    
- Tailwind CSS
    
- TypeScript
    
- React Flow (связи)
    
- Framer Motion (анимации)
    
- dnd-kit / React Beautiful DnD (drag-and-drop)
    
- Zustand / Redux (глобальное состояние)
    
- FastAPI + pandas (сервер)
    

## Пример отображения карточек (React)

```
const Card = ({ paragraph }) => (
  <div className="bg-white text-black rounded-lg shadow-md p-4 my-2">
    <div className="text-sm opacity-60">#{paragraph.paragraph_id}</div>
    <div>{paragraph.text}</div>
  </div>
);

const CardList = ({ paragraphs }) => (
  <div className="flex flex-col max-w-xl mx-auto mt-4">
    {paragraphs.map((p) => (
      <Card key={p.paragraph_id} paragraph={p} />
    ))}
  </div>
);
```

## Интерфейс компонента `CardList`

|Название|Тип|Описание|
|---|---|---|
|`paragraphs`|array|Массив с `paragraph_id`, `text`, `signal_strength`, `complexity` и др.|

## Размещение в проекте

```
/components
  /CardView
    Card.tsx
    CardList.tsx
    styles.css
```

## Установка зависимостей

```
npm install react tailwindcss classnames uuid
npm install react-flow-renderer framer-motion react-beautiful-dnd
npm install papaparse zustand lodash react-hook-form
```

## Автор и контекст

CardView — модуль визуализации текстового анализа внутри ассистента Jeeves. Позволяет интерпретировать результаты анализа, структурировать текст и управлять связями и стилями карточек.