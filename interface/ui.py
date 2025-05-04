import pandas as pd
import numpy as np
import logging
import json # Для передачи данных в JS

def _hex_to_rgb(hex_color):
    """Преобразует HEX цвет (#RRGGBB) в кортеж RGB."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def _rgb_to_hex(rgb_color):
    """Преобразует кортеж RGB в HEX цвет (#RRGGBB)."""
    return f"#{rgb_color[0]:02x}{rgb_color[1]:02x}{rgb_color[2]:02x}"

def _interpolate_color(value, color_start_rgb, color_end_rgb):
    """Линейно интерполирует цвет между двумя RGB цветами на основе значения 0-1."""
    value = np.clip(value, 0, 1)
    interpolated_rgb = [
        int(start + (end - start) * value)
        for start, end in zip(color_start_rgb, color_end_rgb)
    ]
    # Убедимся, что значения в диапазоне 0-255
    interpolated_rgb = [np.clip(c, 0, 255) for c in interpolated_rgb]
    return _rgb_to_hex(interpolated_rgb)

def _normalize_value(value, min_val, max_val):
    """Нормализует значение в диапазон 0-1."""
    if pd.isna(value):
        return 0 # Или другое значение по умолчанию для NaN?
    if max_val == min_val:
        return 1.0 # Если диапазон нулевой, возвращаем 1
    else:
        return (value - min_val) / (max_val - min_val)

def create_styled_report(df: pd.DataFrame, output_html_path: str, topic: str):
    """
    Создает ИНТЕРАКТИВНЫЙ HTML-отчет с таблицей (Semantic, Text), где фон текста
    раскрашен по signal_strength, а цвет текста - по complexity.
    Цвета и размер шрифта текста можно менять с помощью контролов.
    Добавляет заголовок H1 из темы и полосу heatmap для signal_strength.
    """
    if not isinstance(df, pd.DataFrame):
        logging.error("Входные данные не являются pandas DataFrame.")
        return

    required_cols = ['semantic_function', 'text', 'signal_strength', 'complexity'] # Изменено paragraph_id на semantic_function
    if not all(col in df.columns for col in required_cols):
         # Добавляем semantic_function, если его нет (например, пустой для fallback)
         if 'semantic_function' not in df.columns and all(c in df.columns for c in ['paragraph_id', 'text', 'signal_strength', 'complexity']):
             logging.warning("Колонка 'semantic_function' отсутствует, добавляем пустую.")
             df['semantic_function'] = '' # Или pd.NA
             required_cols = ['semantic_function', 'text', 'signal_strength', 'complexity'] # Переопределяем
         else:
            logging.error(f"DataFrame не содержит необходимых колонок: {required_cols}. Имеющиеся: {df.columns.tolist()}")
            return

    logging.info(f"Генерация интерактивного HTML-отчета: {output_html_path}")

    try:
        # 1. Находим диапазоны для нормализации
        signal_values = df['signal_strength'].dropna()
        complexity_values = df['complexity'].dropna()
        min_signal, max_signal = (0, 1) if signal_values.empty else (signal_values.min(), signal_values.max())
        min_complexity, max_complexity = (0, 1) if complexity_values.empty else (complexity_values.min(), complexity_values.max())

        # 2. Задаем дефолтные/начальные цвета и размер шрифта
        default_font_size = 16
        default_colors = {
            "signal_min": "#FFFFFF",
            "signal_max": "#F7C04A",      # Новый цвет (RGB 247, 192, 74)
            "complexity_min": "#008000",
            "complexity_max": "#FF0000"
        }

        # 3. Готовим DataFrame для отображения
        df_display = df[['semantic_function', 'text']].copy()
        df_display.columns = ['Semantic', 'Text']

        # 4. Генерируем базовый HTML таблицы
        styler = df_display.style
        styler.hide(axis="index")
        styler.set_properties(subset=['Text'], **{'text-align': 'left'})
        styler.set_properties(subset=['Semantic'], **{'text-align': 'left', 'vertical-align': 'top'})
        styler.set_td_classes(pd.DataFrame([['semantic-cell', 'text-cell']]*len(df_display), index=df_display.index, columns=['Semantic', 'Text']))
        html_table_content = styler.to_html(escape=False)

        # 5. Подготовка данных для передачи в JavaScript
        js_data = []
        for index, row in df.iterrows():
            js_data.append({
                'semantic': row['semantic_function'],
                'signal': row['signal_strength'] if not pd.isna(row['signal_strength']) else None,
                'complexity': row['complexity'] if not pd.isna(row['complexity']) else None
            })
        js_data_json = json.dumps(js_data)
        js_ranges_json = json.dumps({
            'min_signal': min_signal,
            'max_signal': max_signal,
            'min_complexity': min_complexity,
            'max_complexity': max_complexity
        })
        js_default_colors_json = json.dumps(default_colors)

        # 6. Собираем полный HTML
        html_full = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Interactive Text Analysis Report</title>
            <style>
                body {{ font-family: sans-serif; margin: 20px; }}
                h1 {{ margin-bottom: 25px; font-size: 1.8em; color: #333; }}
                table {{ border-collapse: collapse; width: 100%; margin-top: 20px; table-layout: fixed; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; vertical-align: top; word-wrap: break-word; }}
                th {{ background-color: #f2f2f2; text-align: center; }}
                th:nth-child(1) {{ width: 15%; }}
                th:nth-child(2) {{ width: 85%; }}
                .text-cell {{ white-space: pre-wrap; }}
                .semantic-cell {{ /* Стили для ячеек semantic */ }}
                .controls {{ display: flex; gap: 15px; margin-bottom: 15px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #eee; padding-bottom: 15px; }}
                .control-group {{ display: flex; flex-direction: column; align-items: center; }}
                label {{ margin-bottom: 5px; font-size: 0.85em; color: #555; }}
                input[type="color"] {{ width: 45px; height: 25px; border: 1px solid #ccc; padding: 0; cursor: pointer; }}
                input[type="number"] {{ width: 50px; padding: 4px; font-size: 0.9em; }}
                .heatmap-bar-container {{ margin-bottom: 20px; margin-top: 5px; }}
                #signalHeatmapBar {{
                    height: 25px;
                    width: 100%;
                    border: 1px solid #ccc;
                    background: linear-gradient(to right, {default_colors['signal_min']}, {default_colors['signal_max']});
                }}
            </style>
        </head>
        <body>
            <h1>{topic}</h1>

            <div class="controls">
                 <div class="control-group">
                    <label for="fontSizeInput">Font Size (px)</label>
                    <input type="number" id="fontSizeInput" value="{default_font_size}" min="8" max="30">
                 </div>
                 <div class="control-group">
                    <label for="signalMinColor">Signal Min ({min_signal:.3f})</label>
                    <input type="color" id="signalMinColor" value="{default_colors['signal_min']}">
                </div>
                <div class="control-group">
                    <label for="signalMaxColor">Signal Max ({max_signal:.3f})</label>
                    <input type="color" id="signalMaxColor" value="{default_colors['signal_max']}">
                </div>
                <div class="control-group">
                    <label for="complexityMinColor">Complexity Min ({min_complexity:.3f})</label>
                    <input type="color" id="complexityMinColor" value="{default_colors['complexity_min']}">
                </div>
                 <div class="control-group">
                    <label for="complexityMaxColor">Complexity Max ({max_complexity:.3f})</label>
                    <input type="color" id="complexityMaxColor" value="{default_colors['complexity_max']}">
                </div>
            </div>
            
            <div class="heatmap-bar-container">
                <label for="signalHeatmapBar" style="font-size: 0.85em; color: #555; display: block; margin-bottom: 5px;">Карта распределения соотношения Сигнал/Шум в документе:</label>
                <div id="signalHeatmapBar"></div>
            </div>

            {html_table_content}

            <script>
                // --- Данные из Python ---
                const paragraphData = {js_data_json};
                const ranges = {js_ranges_json};
                let currentColors = {js_default_colors_json};
                let currentFontSize = {default_font_size};

                // --- Элементы DOM ---
                const fontSizeInput = document.getElementById('fontSizeInput');
                const signalMinColorInput = document.getElementById('signalMinColor');
                const signalMaxColorInput = document.getElementById('signalMaxColor');
                const complexityMinColorInput = document.getElementById('complexityMinColor');
                const complexityMaxColorInput = document.getElementById('complexityMaxColor');
                const signalHeatmapBar = document.getElementById('signalHeatmapBar');
                const textCells = document.querySelectorAll('td.text-cell');
                const semanticCells = document.querySelectorAll('td.semantic-cell');

                // --- Вспомогательные функции JS ---
                const hexRegex = /^#?([a-f\d]{{2}})([a-f\d]{{2}})([a-f\d]{{2}})$/i;
                function hexToRgb(hex) {{
                    const result = hexRegex.exec(hex);
                    return result ? [
                        parseInt(result[1], 16),
                        parseInt(result[2], 16),
                        parseInt(result[3], 16)
                    ] : null;
                }}

                function rgbToHex(r, g, b) {{
                    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
                }}
                
                function interpolateColor(value, hexColorStart, hexColorEnd) {{
                    const startRgb = hexToRgb(hexColorStart);
                    const endRgb = hexToRgb(hexColorEnd);
                    if (!startRgb || !endRgb) {{ return '#FFFFFF'; }}
                    value = Math.max(0, Math.min(1, value));
                    const r = Math.round(startRgb[0] + (endRgb[0] - startRgb[0]) * value);
                    const g = Math.round(startRgb[1] + (endRgb[1] - startRgb[1]) * value);
                    const b = Math.round(startRgb[2] + (endRgb[2] - startRgb[2]) * value);
                    return rgbToHex(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)));
                }}

                function normalizeValue(value, minVal, maxVal) {{
                    if (value === null || value === undefined) {{ return 0; }}
                    if (maxVal === minVal) {{ return 1.0; }}
                    return (value - minVal) / (maxVal - minVal);
                }}
                
                // --- Функция обновления полосы heatmap ---
                function updateHeatmapBar() {{
                     if (!signalHeatmapBar || paragraphData.length === 0) {{ return; }}
                     
                     let gradientStops = [];
                     const numParagraphs = paragraphData.length;

                     if (numParagraphs === 1) {{
                        const normalizedSignal = normalizeValue(paragraphData[0].signal, ranges.min_signal, ranges.max_signal);
                        const color = interpolateColor(normalizedSignal, currentColors.signal_min, currentColors.signal_max);
                        gradientStops.push(`${{color}} 0%`);
                        gradientStops.push(`${{color}} 100%`);
                     }} else {{
                         paragraphData.forEach((data, index) => {{
                            const normalizedSignal = normalizeValue(data.signal, ranges.min_signal, ranges.max_signal);
                            const color = interpolateColor(normalizedSignal, currentColors.signal_min, currentColors.signal_max);
                            const startPercent = (index / numParagraphs) * 100;
                            const endPercent = ((index + 1) / numParagraphs) * 100;
                            
                            gradientStops.push(`${{color}} ${{startPercent}}%`);
                            gradientStops.push(`${{color}} ${{endPercent}}%`);
                        }});
                     }}
                    
                    let gradient = `linear-gradient(to right, ${{gradientStops.join(', ')}})`;
                    
                    signalHeatmapBar.style.background = gradient;
                }}

                // --- Основная функция обновления стилей --- 
                function updateTableStyles() {{
                    textCells.forEach((cell, index) => {{
                        if (index < paragraphData.length) {{
                            const data = paragraphData[index];
                            const normalizedSignal = normalizeValue(data.signal, ranges.min_signal, ranges.max_signal);
                            cell.style.backgroundColor = interpolateColor(normalizedSignal, currentColors.signal_min, currentColors.signal_max);
                            const normalizedComplexity = normalizeValue(data.complexity, ranges.min_complexity, ranges.max_complexity);
                            cell.style.color = interpolateColor(normalizedComplexity, currentColors.complexity_min, currentColors.complexity_max);
                            cell.style.fontSize = currentFontSize + 'px';
                        }}
                    }});
                    
                    semanticCells.forEach((cell, index) => {{
                         if (index < paragraphData.length) {{
                             cell.style.fontSize = Math.round(currentFontSize * 0.87) + 'px';
                         }}
                    }});
                    
                    updateHeatmapBar();
                }}

                // --- Обработчики событий ---
                fontSizeInput.addEventListener('input', (event) => {{
                    const newSize = parseInt(event.target.value, 10);
                    if (!isNaN(newSize) && newSize >= 8 && newSize <= 30) {{
                         currentFontSize = newSize;
                         updateTableStyles();
                    }}
                }});

                signalMinColorInput.addEventListener('input', (event) => {{
                    currentColors.signal_min = event.target.value;
                    updateTableStyles();
                }});
                signalMaxColorInput.addEventListener('input', (event) => {{
                    currentColors.signal_max = event.target.value;
                    updateTableStyles();
                }});
                 complexityMinColorInput.addEventListener('input', (event) => {{
                    currentColors.complexity_min = event.target.value;
                    updateTableStyles();
                }});
                complexityMaxColorInput.addEventListener('input', (event) => {{
                    currentColors.complexity_max = event.target.value;
                    updateTableStyles();
                }});

                // --- Инициализация стилей при загрузке страницы ---
                document.addEventListener('DOMContentLoaded', updateTableStyles);

            </script>
        </body>
        </html>
        """

        with open(output_html_path, 'w', encoding='utf-8') as f:
            f.write(html_full)

        logging.info(f"Интерактивный HTML-отчет успешно сохранен: {output_html_path}")

    except Exception as e:
        logging.error(f"Ошибка при создании HTML-отчета: {e}", exc_info=True) 