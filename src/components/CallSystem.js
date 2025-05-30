import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import UserList from './UserList';
import IncomingCall from './IncomingCall';
import './CallSystem.css';

const CallSystem = ({ user, onLogout }) => {
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [currentCall, setCurrentCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, in-call
  const [mediaError, setMediaError] = useState(null);
  const [callType, setCallType] = useState('video'); // 'video' or 'audio'
  
  // Audio refs for ringtones and remote audio
  const ringtoneRef = useRef(null);
  const ringbackRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    const newSocket = io('http://localhost:5001');
    setSocket(newSocket);

    // Register user
    newSocket.emit('register', user);

    // Listen for users update
    newSocket.on('users-update', (usersList) => {
      setUsers(usersList.filter(u => u.id !== newSocket.id));
    });

    // Listen for incoming calls
    newSocket.on('incoming-call', (data) => {
      console.log('📞 CLIENT: Received incoming call:', JSON.stringify(data, null, 2));
      setIncomingCall(data);
      playRingtone();
    });

    // Listen for call answered
    newSocket.on('call-answered', (data) => {
      stopRingback();
      if (currentCall) {
        currentCall.handleAnswer(data.answer);
        setCallStatus('in-call');
      }
    });

    // Listen for call rejected
    newSocket.on('call-rejected', () => {
      stopRingback();
      setCallStatus('idle');
      setCurrentCall(null);
      alert('Call was rejected');
    });

    // Listen for call ended
    newSocket.on('call-ended', () => {
      stopRingtone();
      stopRingback();
      setCallStatus('idle');
      setCurrentCall(null);
      setIncomingCall(null);
    });

    return () => {
      newSocket.close();
    };
  }, [user]);

  const playRingtone = () => {
    // Create audio context for ringtone if no file available
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      
      oscillator.start();
      
      // Stop after 1 second and repeat
      setTimeout(() => {
        oscillator.stop();
        if (incomingCall) {
          setTimeout(() => playRingtone(), 2000);
        }
      }, 1000);
    } catch (e) {
      console.log('Ringtone failed:', e);
    }
  };

  const stopRingtone = () => {
    // Ringtone will stop automatically when incomingCall is cleared
  };

  const playRingback = () => {
    // Create audio context for ringback if no file available
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
      
      oscillator.start();
      
      // Stop after 2 seconds and repeat
      setTimeout(() => {
        oscillator.stop();
        if (callStatus === 'calling') {
          setTimeout(() => playRingback(), 1000);
        }
      }, 2000);
    } catch (e) {
      console.log('Ringback failed:', e);
    }
  };

  const stopRingback = () => {
    // Ringback will stop automatically when callStatus changes
  };

  const checkMediaDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some(device => device.kind === 'videoinput');
      const hasAudio = devices.some(device => device.kind === 'audioinput');
      
      console.log('Available devices:', devices);
      console.log('Has video:', hasVideo, 'Has audio:', hasAudio);
      
      return { hasVideo, hasAudio };
    } catch (error) {
      console.error('Error checking media devices:', error);
      return { hasVideo: false, hasAudio: false };
    }
  };

  const initiateCall = async (targetUser, type = 'video') => {
    if (!socket || callStatus !== 'idle') return;

    console.log('📞 CLIENT: Initiating call:', { targetUser, type });
    setCallStatus('calling');
    setMediaError(null);
    setCallType(type); // Set the call type immediately
    
    try {
      const { hasVideo, hasAudio } = await checkMediaDevices();
      
      // For audio calls, only check for audio devices
      if (type === 'audio' && !hasAudio) {
        throw new Error('No microphone found. Please check your audio devices.');
      }
      
      // For video calls, check both audio and video
      if (type === 'video') {
        if (!hasAudio) {
          throw new Error('No microphone found. Please check your audio devices.');
        }
        if (!hasVideo) {
          throw new Error('No camera found. Please check your video devices.');
        }
      }

      const call = new VideoCall(socket, user, targetUser, type); // Pass type here
      setCurrentCall(call);
      await call.startCall();
      playRingback();
      
    } catch (error) {
      setCallStatus('idle');
      setMediaError(error.message);
      console.error('Error initiating call:', error);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    
    stopRingtone();
    setCallStatus('in-call');
    setMediaError(null);
    
    try {
      const { hasVideo, hasAudio } = await checkMediaDevices();
      
      // Use the call type from the incoming call data
      const incomingCallType = incomingCall.callType || 'video';
      console.log('📞 CLIENT: Accepting call with type:', incomingCallType);
      
      // For audio calls, only check for audio devices
      if (incomingCallType === 'audio' && !hasAudio) {
        throw new Error('No microphone found. Please check your audio devices.');
      }
      
      // For video calls, check both audio and video
      if (incomingCallType === 'video') {
        if (!hasAudio) {
          throw new Error('No microphone found. Please check your audio devices.');
        }
        if (!hasVideo) {
          throw new Error('No camera found. Please check your video devices.');
        }
      }

      const call = new VideoCall(socket, user, incomingCall.callerInfo, incomingCallType);
      setCurrentCall(call);
      await call.answerCall(incomingCall.offer, incomingCall.callerId);
      setIncomingCall(null);
      
    } catch (error) {
      console.error('Error answering call:', error);
      setCallStatus('idle');
      setIncomingCall(null);
      setMediaError(error.message);
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socket.emit('reject-call', { callerId: incomingCall.callerId });
    }
    stopRingtone();
    setIncomingCall(null);
  };

  const endCall = () => {
    if (currentCall) {
      currentCall.endCall();
    }
    setCallStatus('idle');
    setCurrentCall(null);
    setIncomingCall(null);
    setMediaError(null);
  };

  return (
    <div className="call-system">
      {/* Audio elements for ringtones */}
      <audio ref={ringtoneRef} preload="auto">
        <source src="/ringtone.mp3" type="audio/mpeg" />
      </audio>
      <audio ref={ringbackRef} preload="auto">
        <source src="/ringback.mp3" type="audio/mpeg" />
      </audio>
      
      {/* Hidden audio elements for remote streams */}
      <audio id="localAudio" autoPlay muted style={{ display: 'none' }}></audio>
      <audio id="remoteAudio" autoPlay style={{ display: 'none' }}></audio>

      <header className="call-header">
        <h1>Voice & Video Call</h1>
        <div className="user-info">
          <span>Welcome, {user.username}</span>
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <main className="call-content">
        {mediaError && (
          <div className="error-message">
            <p>{mediaError}</p>
            <button onClick={() => setMediaError(null)} className="dismiss-btn">Dismiss</button>
          </div>
        )}

        {callStatus === 'idle' && (
          <UserList users={users} onCallUser={initiateCall} />
        )}

        {callStatus === 'calling' && (
          <div className="calling-status">
            <h3>Calling {currentCall?.targetUser?.username}...</h3>
            <p>{callType === 'audio' ? '📞 Voice Call' : '📹 Video Call'}</p>
            <button onClick={endCall} className="end-call-btn">Cancel</button>
          </div>
        )}

        {callStatus === 'in-call' && currentCall && (
          <>
            {(incomingCall?.callType || callType) === 'video' ? (
              <div className="video-call-container">
                <video id="localVideo" className="local-video" autoPlay muted playsInline></video>
                <video id="remoteVideo" className="remote-video" autoPlay playsInline></video>
                <div className="call-controls">
                  <button onClick={endCall} className="end-call-btn">End Call</button>
                </div>
              </div>
            ) : (
              <div className="audio-call-container">
                <div className="audio-call-info">
                  <div className="caller-avatar">
                    <div className="avatar-text">
                      {(currentCall?.targetUser?.username || incomingCall?.callerInfo?.username || 'U').charAt(0).toUpperCase()}
                    </div>
                  </div>
                  <h3>{currentCall?.targetUser?.username || incomingCall?.callerInfo?.username}</h3>
                  <p>Voice Call in Progress</p>
                  <div className="audio-visualizer">
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                  </div>
                </div>
                <div className="call-controls">
                  <button onClick={endCall} className="end-call-btn">End Call</button>
                </div>
              </div>
            )}
          </>
        )}

        {incomingCall && (
          <IncomingCall
            callerInfo={incomingCall.callerInfo}
            callType={incomingCall.callType || 'video'}
            onAccept={acceptCall}
            onReject={rejectCall}
          />
        )}
      </main>
    </div>
  );
};

// VideoCall class for handling WebRTC
class VideoCall {
  constructor(socket, user, targetUser, callType = 'video') {
    this.socket = socket;
    this.user = user;
    this.targetUser = targetUser;
    this.callType = callType;
    this.localStream = null;
    this.peerConnection = null;

    this.setupPeerConnection();
  }

  setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      const [remoteStream] = event.streams;
      
      if (this.callType === 'video') {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
          remoteVideo.srcObject = remoteStream;
          remoteVideo.volume = 1.0;
          
          // Force play after user interaction
          remoteVideo.play().catch(e => {
            console.log('Remote video autoplay failed, will play after user interaction:', e);
          });
        }
      } else {
        // For audio calls, use the audio element
        const remoteAudio = document.getElementById('remoteAudio');
        if (remoteAudio) {
          remoteAudio.srcObject = remoteStream;
          remoteAudio.volume = 1.0;
          
          // Force play and handle audio context
          const playAudio = async () => {
            try {
              // Resume audio context if suspended
              if (window.AudioContext) {
                const audioContext = new AudioContext();
                if (audioContext.state === 'suspended') {
                  await audioContext.resume();
                }
              }
              
              await remoteAudio.play();
              console.log('✅ Remote audio started playing');
            } catch (e) {
              console.log('❌ Remote audio autoplay failed:', e);
              
              // Add click listener to start audio after user interaction
              const startAudio = () => {
                remoteAudio.play();
                document.removeEventListener('click', startAudio);
                console.log('✅ Remote audio started after user click');
              };
              document.addEventListener('click', startAudio);
            }
          };
          
          playAudio();
        }
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          candidate: event.candidate,
          targetUserId: this.targetUser.id
        });
      }
    };

    // Listen for ICE candidates
    this.socket.on('ice-candidate', (data) => {
      if (data.senderId !== this.socket.id) {
        this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });
  }

  async getUserMedia() {
    try {
      if (this.callType === 'audio') {
        // For audio calls, only request audio with enhanced settings
        const constraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
            channelCount: 1
          },
          video: false
        };
        console.log('Audio call constraints:', constraints);
        return await navigator.mediaDevices.getUserMedia(constraints);
      }
      
      // For video calls, request both audio and video
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };
      
      console.log('Video call constraints:', constraints);
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.error('Error getting user media:', error);
      
      // Fallback for audio calls
      if (this.callType === 'audio') {
        try {
          return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (fallbackError) {
          console.error('Audio fallback failed:', fallbackError);
          throw new Error('Unable to access microphone. Please check permissions.');
        }
      }
      
      throw new Error('Unable to access camera or microphone. Please check permissions.');
    }
  }

  async startCall() {
    try {
      console.log('📞 CLIENT: Starting call with type:', this.callType);
      
      // Get user media
      this.localStream = await this.getUserMedia();
      console.log('Local stream tracks:', this.localStream.getTracks());

      // Add local stream to peer connection
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track:', track.kind, track);
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Display local media
      if (this.callType === 'video') {
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
          localVideo.srcObject = this.localStream;
        }
      }

      // Create offer
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.callType === 'video'
      });
      await this.peerConnection.setLocalDescription(offer);

      const callData = {
        targetUserId: this.targetUser.id,
        offer: offer,
        callerInfo: this.user,
        callType: this.callType // Make sure to include call type
      };
      
      console.log('📞 CLIENT: Sending call-user event:', JSON.stringify(callData, null, 2));
      
      // Send offer to target user
      this.socket.emit('call-user', callData);

    } catch (error) {
      console.error('Error starting call:', error);
      throw error;
    }
  }

  async answerCall(offer, callerId) {
    try {
      console.log('📞 CLIENT: Answering call with type:', this.callType);
      
      // Get user media
      this.localStream = await this.getUserMedia();
      console.log('Local stream tracks:', this.localStream.getTracks());

      // Add local stream to peer connection
      this.localStream.getTracks().forEach(track => {
        console.log('Adding track:', track.kind, track);
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Display local media
      if (this.callType === 'video') {
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
          localVideo.srcObject = this.localStream;
        }
      }

      // Set remote description
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await this.peerConnection.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.callType === 'video'
      });
      await this.peerConnection.setLocalDescription(answer);

      // Send answer
      this.socket.emit('answer-call', {
        answer: answer,
        callerId: callerId
      });

    } catch (error) {
      console.error('Error answering call:', error);
      throw error;
    }
  }

  async handleAnswer(answer) {
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('Answer handled successfully');
    } catch (error) {
      console.error('Error handling answer:', error);
    }
  }

  endCall() {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
    }

    // Notify other user
    this.socket.emit('end-call', { targetUserId: this.targetUser.id });

    // Clean up media elements
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const remoteAudio = document.getElementById('remoteAudio');
    
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;
  }
}

export default CallSystem; 