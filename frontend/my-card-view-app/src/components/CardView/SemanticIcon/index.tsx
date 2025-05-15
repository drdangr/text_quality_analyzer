import React from 'react';

// Импортируем все иконки как обычные ресурсы
import RaskrytieTemySvg from '../../../assets/icons/раскрытие_темы.svg';
import PoyasnenieNaPrimereSvg from '../../../assets/icons/пояснение_на_примере.svg';
import LiricheskoeOtstuplenieSvg from '../../../assets/icons/лирическое_отступление.svg';
import KlyuchevoyTezisSvg from '../../../assets/icons/ключевой_тезис.svg';
import ShumSvg from '../../../assets/icons/шум.svg';
import MetaforaIliAnalogiyaSvg from '../../../assets/icons/метафора_или_аналогия.svg';
import YumorIroniyaSarkazmSvg from '../../../assets/icons/юмор_ирония_сарказм.svg';
import SvyazuyushchiyPerehodSvg from '../../../assets/icons/связующий_переход.svg';
import SmenaTemySvg from '../../../assets/icons/смена_темы.svg';
import ProtivopostavlenieKontrastSvg from '../../../assets/icons/противопоставление_контраст.svg';

interface SemanticIconProps {
  semanticFunction: string | null | undefined;
  size?: number;
}

// Функция для получения иконки по типу семантической функции
const getIconForType = (semanticType: string, size: number) => {
  const iconStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    display: 'inline-block',
    marginRight: '8px',
    verticalAlign: 'middle'
  };

  if (semanticType.includes('раскрытие темы')) {
    return <img src={RaskrytieTemySvg} alt="Раскрытие темы" title="Раскрытие темы" style={iconStyle} />;
  } else if (semanticType.includes('пояснение на примере')) {
    return <img src={PoyasnenieNaPrimereSvg} alt="Пояснение на примере" title="Пояснение на примере" style={iconStyle} />;
  } else if (semanticType.includes('лирическое отступление')) {
    return <img src={LiricheskoeOtstuplenieSvg} alt="Лирическое отступление" title="Лирическое отступление" style={iconStyle} />;
  } else if (semanticType.includes('ключевой тезис')) {
    return <img src={KlyuchevoyTezisSvg} alt="Ключевой тезис" title="Ключевой тезис" style={iconStyle} />;
  } else if (semanticType.includes('шум')) {
    return <img src={ShumSvg} alt="Шум" title="Шум" style={iconStyle} />;
  } else if (semanticType.includes('метафора или аналогия')) {
    return <img src={MetaforaIliAnalogiyaSvg} alt="Метафора или аналогия" title="Метафора или аналогия" style={iconStyle} />;
  } else if (semanticType.includes('юмор или ирония или сарказм')) {
    return <img src={YumorIroniyaSarkazmSvg} alt="Юмор или ирония или сарказм" title="Юмор или ирония или сарказм" style={iconStyle} />;
  } else if (semanticType.includes('связующий переход')) {
    return <img src={SvyazuyushchiyPerehodSvg} alt="Связующий переход" title="Связующий переход" style={iconStyle} />;
  } else if (semanticType.includes('смена темы')) {
    return <img src={SmenaTemySvg} alt="Смена темы" title="Смена темы" style={iconStyle} />;
  } else if (semanticType.includes('противопоставление или контраст')) {
    return <img src={ProtivopostavlenieKontrastSvg} alt="Противопоставление или контраст" title="Противопоставление или контраст" style={iconStyle} />;
  }
  
  return null;
};

const SemanticIcon: React.FC<SemanticIconProps> = ({ semanticFunction, size = 20 }) => {
  if (!semanticFunction) return null;

  // Отладочная информация
  console.log(`SemanticIcon: получена функция "${semanticFunction}"`);

  // Разбиваем строку на отдельные семантические функции, если они разделены "/"
  const semanticTypes = semanticFunction.split('/').map(type => type.trim().toLowerCase());
  console.log(`SemanticIcon: распознано ${semanticTypes.length} функций:`, semanticTypes);

  // Если функция только одна, возвращаем одну иконку
  if (semanticTypes.length === 1) {
    return getIconForType(semanticTypes[0], size);
  }

  // Если функций несколько, возвращаем все соответствующие иконки
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {semanticTypes.map((type, index) => {
        const icon = getIconForType(type, size);
        return icon ? <React.Fragment key={index}>{icon}</React.Fragment> : null;
      })}
    </div>
  );
};

export default SemanticIcon;