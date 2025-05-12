// import React from 'react'; // Удаляем, так как React не используется явно
import CardList from './components/CardView/CardList';
// import './App.css'; // Можно удалить или закомментировать, если стили из App.css не нужны

function App() {
  return (
    // <div className="App"> // Класс "App" можно удалить, если не используется
    <div>
      <CardList />
    </div>
  );
}

export default App;
