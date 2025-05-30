import React, { useState, useEffect } from 'react';
import './App.css';
import CallSystem from './components/CallSystem';
import UserLogin from './components/UserLogin';

function App() {
  const [user, setUser] = useState(null);

  return (
    <div className="App">
      {!user ? (
        <UserLogin onLogin={setUser} />
      ) : (
        <CallSystem user={user} onLogout={() => setUser(null)} />
      )}
    </div>
  );
}

export default App;
