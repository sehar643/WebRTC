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
  const [callStatus, setCallStatus] = useState('idle'); // idle, calling, connecting, connected
  const [mediaError, setMediaError] = useState(null);
  const [callType, setCallType] = useState('video');
  const [connectionState, setConnectionState] = useState('new');
  
  // Audio refs for ringtones and remote audio
  const ringtoneRef = useRef(null);
  const ringbackRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    const newSocket = io('http://localhost:5001');
    setSocket(newSocket);

    // Register user
    newSocket.emit('register', user);

    // Store cleanup functions
    const cleanupFunctions = [];

    // Listen for users update
    newSocket.on('users-update', (usersList) => {
      setUsers(usersList.filter(u => u.id !== newSocket.id));
    });

    // Listen for incoming calls
    newSocket.on('incoming-call', (data) => {
      console.log('Received incoming call:', data);
      setIncomingCall(data);
      setCallType(data.callType || 'video');
      playRingtone();
    });

    // Listen for call answered
    newSocket.on('call-answered', async (data) => {
      console.log('Call answered:', data);
      stopRingback();
      if (currentCall) {
        try {
          await currentCall.handleAnswer(data.answer);
          setCallStatus('connecting');
        } catch (error) {
          console.error('Error handling answer:', error);
          endCall();
        }
      }
    });

    // Listen for ICE candidates with proper cleanup
    const handleIceCandidate = async (data) => {
      console.log('Received ICE candidate');
      if (!currentCall?.peerConnection) return;

      try {
        if (data.senderId === newSocket.id) {
          console.log('Ignoring own ICE candidate');
          return;
        }

        if (currentCall.peerConnection.signalingState === 'closed') {
          console.log('Ignoring ICE candidate - connection is closed');
          return;
        }

        // Create a promise that resolves when the remote description is set
        const waitForRemoteDescription = () => {
          return new Promise((resolve) => {
            const checkDescription = () => {
              if (currentCall?.peerConnection?.remoteDescription) {
                resolve();
              } else if (currentCall?.peerConnection?.signalingState !== 'closed') {
                setTimeout(checkDescription, 100);
              }
            };
            checkDescription();
          });
        };

        // Wait for remote description before adding candidate
        await waitForRemoteDescription();
        
        if (currentCall?.peerConnection?.signalingState !== 'closed') {
          await currentCall.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          console.log('Added ICE candidate successfully');
        }
      } catch (error) {
        console.warn('Error handling ICE candidate:', error);
      }
    };

    newSocket.on('ice-candidate', handleIceCandidate);
    cleanupFunctions.push(() => newSocket.off('ice-candidate', handleIceCandidate));

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
      endCall();
    });

    // Cleanup function
    return () => {
      console.log('Cleaning up socket and call resources');
      if (currentCall) {
        currentCall.endCall();
      }
      cleanupFunctions.forEach(cleanup => cleanup());
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

    console.log('Initiating call:', { targetUser, type });
    setCallStatus('calling');
    setMediaError(null);
    setCallType(type);
    setConnectionState('new');
    
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

      const call = new VideoCall(socket, user, targetUser, type);
      call.setConnectionStateHandler((state) => {
        setConnectionState(state);
        if (state === 'connected') {
          setCallStatus('connected');
        } else if (state === 'failed' || state === 'disconnected') {
          endCall();
        }
      });
      
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
    setCallStatus('connecting');
    setMediaError(null);
    setConnectionState('new');
    
    try {
      const { hasVideo, hasAudio } = await checkMediaDevices();
      
      const incomingCallType = incomingCall.callType || 'video';
      console.log('Accepting call with type:', incomingCallType);
      setCallType(incomingCallType);
      
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
      call.setConnectionStateHandler((state) => {
        setConnectionState(state);
        if (state === 'connected') {
          setCallStatus('connected');
        } else if (state === 'failed' || state === 'disconnected') {
          endCall();
        }
      });
      
      setCurrentCall(call);
      const answer = await call.answerCall(incomingCall.offer, incomingCall.callerId);
      
      // Send answer
      socket.emit('answer-call', {
        answer: answer,
        callerId: incomingCall.callerId,
        callType: incomingCallType
      });
      
      setIncomingCall(null);
      
    } catch (error) {
      console.error('Error accepting call:', error);
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
    console.log('Ending call and cleaning up resources');
    stopRingtone();
    stopRingback();
    
    if (currentCall) {
      currentCall.endCall();
    }
    
    setCallStatus('idle');
    setCurrentCall(null);
    setIncomingCall(null);
    setConnectionState('new');
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
      
      {/* Hidden audio elements for call audio */}
      <audio 
        id="remoteAudio" 
        autoPlay 
        playsInline
        ref={remoteAudioRef}
        style={{ display: 'none' }}
      />
      <audio 
        id="localAudio" 
        autoPlay 
        muted 
        playsInline
        style={{ display: 'none' }}
      />

      {/* Video elements (only shown for video calls) */}
      {callType === 'video' && callStatus === 'in-call' && (
        <div className="video-call-container">
          <video id="localVideo" className="local-video" autoPlay muted playsInline></video>
          <video id="remoteVideo" className="remote-video" autoPlay playsInline></video>
        </div>
      )}

      {/* Audio call UI */}
      {callType === 'audio' && (callStatus === 'connecting' || callStatus === 'connected') && (
        <div className="audio-call-container">
          <div className="audio-call-info">
            <div className="caller-avatar">
              <div className="avatar-text">
                {(currentCall?.targetUser?.username || incomingCall?.callerInfo?.username || 'U').charAt(0).toUpperCase()}
              </div>
            </div>
            <h3>{currentCall?.targetUser?.username || incomingCall?.callerInfo?.username}</h3>
            <p>{callStatus === 'connecting' ? 'Establishing Connection...' : 'Voice Call in Progress'}</p>
            <div className={`audio-visualizer ${callStatus === 'connected' ? 'active' : ''}`}>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
              <div className="bar"></div>
            </div>
            {connectionState !== 'connected' && (
              <div className="connection-status">
                Connection Status: {connectionState}
              </div>
            )}
          </div>
          <div className="call-controls">
            <button onClick={endCall} className="end-call-btn">End Call</button>
          </div>
        </div>
      )}

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
    this.isInitiator = false;
    this.connectionStateHandler = null;

    this.setupPeerConnection();
  }

  setupPeerConnection() {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    console.log('Setting up new peer connection');
    this.peerConnection = new RTCPeerConnection(configuration);

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('Connection state changed:', state);
      
      if (this.connectionStateHandler) {
        this.connectionStateHandler(state);
      }

      switch(state) {
        case 'connected':
          console.log('✅ Peers connected successfully');
          break;
        case 'disconnected':
          console.log('❌ Peers disconnected');
          break;
        case 'failed':
          console.log('❌ Connection failed');
          this.endCall();
          break;
      }
    };

    // Handle ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', this.peerConnection.iceConnectionState);
      if (this.peerConnection.iceConnectionState === 'connected') {
        console.log('✅ ICE connection established');
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      const [remoteStream] = event.streams;
      
      if (this.callType === 'video') {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
          remoteVideo.srcObject = remoteStream;
          remoteVideo.play().catch(e => console.warn('Remote video autoplay failed:', e));
        }
      } else {
        // For audio calls, ensure proper audio handling
        const remoteAudio = document.getElementById('remoteAudio');
        if (remoteAudio) {
          console.log('Setting up remote audio stream');
          remoteAudio.srcObject = remoteStream;
          remoteAudio.volume = 1.0;
          
          // Handle audio autoplay with fallback
          const playAudio = async () => {
            try {
              // Ensure audio context is running
              if (window.AudioContext || window.webkitAudioContext) {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state === 'suspended') {
                  await audioContext.resume();
                  console.log('AudioContext resumed')
                }
              }
              
              await remoteAudio.play();
              console.log('Remote audio playing successfully');
            } catch (error) {
              console.warn('Audio autoplay failed, waiting for user interaction:', error);
              
              // Add a click handler for user interaction
              const startAudio = async () => {
                try {
                  await remoteAudio.play();
                  console.log('Audio started after user interaction');
                  document.removeEventListener('click', startAudio);
                } catch (e) {
                  console.error('Failed to play audio after user interaction:', e);
                }
              };
              document.addEventListener('click', startAudio);
            }
          };
          
          playAudio();
        } else {
          console.error('Remote audio element not found!');
        }
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate');
        this.socket.emit('ice-candidate', {
          candidate: event.candidate,
          targetUserId: this.targetUser.id
        });
      }
    };
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
      console.log('Starting call as initiator');
      this.isInitiator = true;
      
      // Get user media
      this.localStream = await this.getUserMedia();
      
      // Add tracks to the peer connection
      this.localStream.getTracks().forEach(track => {
        console.log('Adding local track:', track.kind);
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Display local media
      if (this.callType === 'video') {
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
          localVideo.srcObject = this.localStream;
          localVideo.play().catch(e => console.warn('Local video autoplay failed:', e));
        }
      }

      // Create and set local description
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.callType === 'video'
      });
      
      console.log('Setting local description');
      await this.peerConnection.setLocalDescription(offer);

      // Send the offer
      this.socket.emit('call-user', {
        targetUserId: this.targetUser.id,
        offer: offer,
        callerInfo: this.user,
        callType: this.callType
      });

    } catch (error) {
      console.error('Error in startCall:', error);
      throw error;
    }
  }

  async answerCall(offer, callerId) {
    try {
      console.log('Answering call');
      if (!this.peerConnection) {
        console.warn('No peer connection, setting up new one');
        this.setupPeerConnection();
      }

      // Get user media
      this.localStream = await this.getUserMedia();
      
      // Add tracks to the peer connection
      this.localStream.getTracks().forEach(track => {
        console.log('Adding local track:', track.kind);
        this.peerConnection.addTrack(track, this.localStream);
      });

      // Display local media
      if (this.callType === 'video') {
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
          localVideo.srcObject = this.localStream;
          localVideo.play().catch(e => console.warn('Local video autoplay failed:', e));
        }
      }

      // Set remote description (offer)
      console.log('Setting remote description (offer)');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create and set local description (answer)
      console.log('Creating answer');
      const answer = await this.peerConnection.createAnswer();
      
      console.log('Setting local description (answer)');
      await this.peerConnection.setLocalDescription(answer);

      return answer;

    } catch (error) {
      console.error('Error in answerCall:', error);
      throw error;
    }
  }

  async handleAnswer(answer) {
    try {
      console.log('Handling answer from remote peer');
      if (!this.peerConnection) {
        throw new Error('No peer connection available');
      }
      
      if (this.peerConnection.signalingState === 'stable') {
        console.log('Connection already stable, ignoring answer');
        return;
      }

      console.log('Setting remote description (answer)');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('Remote description set successfully');
      
    } catch (error) {
      console.error('Error handling answer:', error);
      throw error;
    }
  }

  endCall() {
    console.log('Cleaning up call resources');
    try {
      // Stop all tracks
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          track.stop();
          console.log('Stopped track:', track.kind);
        });
      }

      // Remove all event listeners
      if (this.peerConnection) {
        this.peerConnection.onicecandidate = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onnegotiationneeded = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.onicegatheringstatechange = null;
        this.peerConnection.onsignalingstatechange = null;
        this.connectionStateHandler = null;
        
        // Close the connection
        this.peerConnection.close();
        this.peerConnection = null;
      }

      // Clean up media elements
      const localVideo = document.getElementById('localVideo');
      const remoteVideo = document.getElementById('remoteVideo');
      const remoteAudio = document.getElementById('remoteAudio');
      const localAudio = document.getElementById('localAudio');
      
      [localVideo, remoteVideo, remoteAudio, localAudio].forEach(element => {
        if (element) {
          element.srcObject = null;
          element.remove();
        }
      });

    } catch (error) {
      console.error('Error during call cleanup:', error);
    }
  }

  setConnectionStateHandler(handler) {
    this.connectionStateHandler = handler;
  }
}

export default CallSystem; 