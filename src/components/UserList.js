import React from 'react';
import './UserList.css';

const UserList = ({ users, onCallUser }) => {
  return (
    <div className="user-list">
      <h3>Online Users</h3>
      {users.length === 0 ? (
        <p>No other users online</p>
      ) : (
        <div className="users">
          {users.map(user => (
            <div key={user.id} className="user-item">
              <span className="username">{user.username}</span>
              <div className="call-buttons">
                <button 
                  onClick={() => onCallUser(user, 'audio')}
                  className="call-btn audio-call-btn"
                  title="Audio Call"
                >
                  📞
                </button>
                <button 
                  onClick={() => onCallUser(user, 'video')}
                  className="call-btn video-call-btn"
                  title="Video Call"
                >
                  📹
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserList; 