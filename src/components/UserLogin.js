import React, { useState } from 'react';
import './UserLogin.css';

const UserLogin = ({ onLogin }) => {
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username.trim()) {
      onLogin({ username: username.trim() });
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <h2>Join Video Call</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <button type="submit">Join</button>
        </form>
      </div>
    </div>
  );
};

export default UserLogin; 