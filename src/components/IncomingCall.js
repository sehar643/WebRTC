import React from 'react';
import './IncomingCall.css';

const IncomingCall = ({ callerInfo, callType, onAccept, onReject }) => {
  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-modal">
        <div className="call-type-icon">
          {callType === 'video' ? '📹' : '📞'}
        </div>
        <h3>Incoming {callType.charAt(0).toUpperCase() + callType.slice(1)} Call</h3>
        <p>{callerInfo.username} is calling you</p>
        <div className="call-actions">
          <button onClick={onAccept} className="accept-btn">
            {callType === 'video' ? '📹' : '📞'} Accept
          </button>
          <button onClick={onReject} className="reject-btn">
            ❌ Reject
          </button>
        </div>
      </div>
    </div>
  );
};

export default IncomingCall; 