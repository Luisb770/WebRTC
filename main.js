document.addEventListener("DOMContentLoaded", () => {
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const startButton = document.getElementById('startButton');
  const hangupButton = document.getElementById('hangupButton');

  let localStream;
  let peerConnection;

  const pubnub = new PubNub({
    publishKey: 'pub-c-d8e5e5ee-1234-47e1-8986-4fb7f1a7e6f1',
    subscribeKey: 'sub-c-cd13ae42-d352-4daf-927e-cead3be9595d',
    uuid: crypto.randomUUID(),
  });

  const servers = {
    iceServers: [
      {
        urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
      localStream = stream;
      localVideo.srcObject = stream;
      startButton.disabled = false;
    })
    .catch(handleError);

  startButton.addEventListener('click', () => {
    startButton.disabled = true;
    hangupButton.disabled = false;

    peerConnection = new RTCPeerConnection(servers);

    // Add local stream to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track);
    });

    // Send offer to remote
    peerConnection.createOffer()
      .then(offer => peerConnection.setLocalDescription(offer))
      .then(() => {
        pubnub.publish({
          channel: 'webrtc',
          message: { offer: peerConnection.localDescription },
        });
      });

    // Listen for ICE candidates from remote
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        pubnub.publish({
          channel: 'webrtc',
          message: { ice: event.candidate },
        });
      }
    };

    // Listen for remote stream
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
    };

    // Subscribe to PubNub channel for messages
    pubnub.subscribe({
      channels: ['webrtc'],
      message: handleMessage,
    });
  });

  hangupButton.addEventListener('click', () => {
    peerConnection.close();
    localStream.getTracks().forEach(track => track.stop());
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    startButton.disabled = false;
    hangupButton.disabled = true;

    // Unsubscribe from PubNub channel
    pubnub.unsubscribe({
      channels: ['webrtc'],
    });
  });

  function handleMessage(message) {
    if (message.offer) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer))
        .then(() => peerConnection.createAnswer())
        .then(answer => peerConnection.setLocalDescription(answer))
        .then(() => {
          pubnub.publish({
            channel: 'webrtc',
            message: { answer: peerConnection.localDescription },
          });
        });
    } else if (message.answer) {
      peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer))
        .then(() => {
          // remote answer set
        });
    } else if (message.ice) {
      peerConnection.addIceCandidate(new RTCIceCandidate(message.ice));
    }
  }

  function handleError(error) {
    console.error('Error accessing media devices:', error);
  }
});
