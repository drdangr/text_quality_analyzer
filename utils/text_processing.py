import re

def split_into_paragraphs(text: str) -> list[str]:
    """Разбивает текст на параграфы по двойному переносу строки."""
    if not isinstance(text, str):
        return []
    # Заменяем \r\n на \n для унификации, затем разбиваем по \n\n
    paragraphs = text.replace('\r\n', '\n').split('\n\n')
    # Удаляем пустые строки, которые могли образоваться
    paragraphs = [p.strip() for p in paragraphs if p.strip()]
    return paragraphs 