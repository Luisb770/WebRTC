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

  // Subscribe to PubNub channel for messages
  pubnub.subscribe({
    channels: ['webrtc'],
    message: handleMessage,
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
      .then(offer => {
        console.log('Local offer created:', offer);
        return peerConnection.setLocalDescription(offer);
      })
      .then(() => {
        console.log('Local offer set as local description');
        pubnub.publish({
          channel: 'webrtc',
          message: { offer: peerConnection.localDescription },
        });
      });

    // Listen for ICE candidates from remote
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Local ICE candidate:', event.candidate);
        pubnub.publish({
          channel: 'webrtc',
          message: { ice: event.candidate },
        });
      }
    };

    // Listen for remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote stream:', event.streams[0]);
      remoteVideo.srcObject = event.streams[0];
    };
  });

  hangupButton.addEventListener('click', () => {
    if (peerConnection) {
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

      // Reset the peerConnection variable
      peerConnection = null;
    }
  });

  function handleMessage(message) {
    console.log('Received message:', message);

    if (peerConnection) {
      if (message.offer) {
        console.log('Received remote offer:', message.offer);
        peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer))
          .then(() => peerConnection.createAnswer())
          .then(answer => {
            console.log('Local answer created:', answer);
            return peerConnection.setLocalDescription(answer);
          })
          .then(() => {
            console.log('Local answer set as local description');
            pubnub.publish({
              channel: 'webrtc',
              message: { answer: peerConnection.localDescription },
            });
          });
      } else if (message.answer) {
        console.log('Received remote answer:', message.answer);
        peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer))
          .then(() => {
            console.log('Remote answer set as remote description');
          });
      } else if (message.ice) {
        console.log('Received remote ICE candidate:', message.ice);
        peerConnection.addIceCandidate(new RTCIceCandidate(message.ice))
          .then(() => {
            console.log('Remote ICE candidate added successfully');
          })
          .catch(error => {
            console.error('Error adding remote ICE candidate:', error);
          });
      }
    }
  }

  function handleError(error) {
    console.error('Error accessing media devices:', error);
  }
});
