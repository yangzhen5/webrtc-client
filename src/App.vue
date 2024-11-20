<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { io, Socket } from 'socket.io-client'
const called = ref<boolean>(false) //是否是接收方
const caller = ref<boolean>(false) //是否是发起方
const calling = ref<boolean>(false) //呼叫中
const communicating = ref<boolean>(false) //视频通话中
const localvideo = ref<any>() // video标签实例，播放本人的视频
const remotevideo = ref<any>() // video标签实例，播放对方的视频
const roomID = '123'
const socket = ref<Socket>()
const peer = ref<any>()
const localStream = ref<any>()

onMounted(() => {
  const sock = io('http://localhost:3000')
  sock.on('conectSuccess', () => {
    //加入房间
    sock.emit('joinRoom', roomID)
  })

  //监听callRemote事件 接收方接收到邀请
  sock.on('callRemote1', () => {
    if (!caller.value) {
      //不是呼叫方
      called.value = true
      calling.value = true
    }
  })
  //发送方监听对方同意事件
  sock.on('acceptCall1', async () => {
    if (caller.value) {
      //用户A收到用户B同意的请求  创建连接
      peer.value = new RTCPeerConnection()
      // peer.value.addStream(localStream.value)
      localStream.value.getTracks().forEach((track: any) => {
        peer.value.addTrack(track, localStream.value)
      })
      // 通过监听onicecandidate事件获取candidate信息 连接的远端的基本信息
      // 如果事件的candidate属性是null，ICE收集已经完成。不应将此消息发送到远程对等方。
      // 调用 setLocalDescription()后触发
      peer.value.onicecandidate = (event: any) => {
        if (event.candidate) {
          // console.log('本地的candidate：', event.candidate)
          socket.value?.emit('sendCandidate', { roomID, candidate: event.candidate })
        }
      }
      // //监听onaddstream来获取对方的音视频流 一旦从远程对等方接收到视频流，它就会处理视频流的显示
      //当RTCPeerConnection.setRemoteDescription() 后此事件立即被调用而不需要等待 SDP 交换完成。
      peer.value.onaddstream = (event: any) => {
        communicating.value = true
        calling.value = false
        remotevideo.value!.srcObject = event.stream
        remotevideo.value!.play()
      }

      const offer = await peer.value.createOffer({
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
      })
      //设置本地offer信息  offer在建立连接后会发送给远端
      await peer.value.setLocalDescription(offer)
      //发送offer给服务器
      socket.value?.emit('sendOffer', { offer, roomID })
    }
  })
  //收到offer
  sock.on('sendOffer1', async (offer) => {
    if (called.value) {
      //用户B需要创建自己的RTCPeerConnection，添加本地音视频流，设置远端描述信息，生成answer，并且通
      peer.value = new RTCPeerConnection()
      await getLocalStream()
      // peer.value.addStream(localStream.value)
      localStream.value.getTracks().forEach((track: any) => {
        peer.value.addTrack(track, localStream.value)
      })
      //通过监听onicecandidate事件获取candidate信息  设置完本地sdp会触发
      peer.value.onicecandidate = (event: any) => {
        if (event.candidate) {
          socket.value?.emit('sendCandidate', { roomID, candidate: event.candidate })
        }
      }
      // //监听onaddstream来获取对方的音视频流
      peer.value.onaddstream = (event: any) => {
        communicating.value = true
        calling.value = false
        remotevideo.value!.srcObject = event.stream
        remotevideo.value!.play()
      }
      try {
        await peer.value.setRemoteDescription(offer)
      } catch (err) {
        console.log('远端描述设置错误:', err)
      }
      // let answer
      const answer = await peer.value.createAnswer()
      await peer.value.setLocalDescription(answer)
      socket.value?.emit('sendAnswer', { answer, roomID })
    }
  })
  //收到answer
  sock.on('sendAnswer1', async (answer) => {
    if (caller.value) {
      try {
        await peer.value.setRemoteDescription(answer)
      } catch (err) {
        console.log('远端设置错误', err)
      }
    }
  })
  //B收到A的can 描述描述了连接的远程端的状态。
  sock.on('sendCandidate1', async (candidate) => {
    try {
      await peer.value.addIceCandidate(candidate)
    } catch (err) {
      console.log('远端ice候选设置失败', err)
    }
  })
  sock.on('hangup1', async () => {
    hangUp()
  })

  socket.value = sock
})
//获取本地音视频流
const getLocalStream = async () => {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    })
  } catch (err) {
    console.log('获取本地媒体流失败', err)
  }
  // console.log('流是否可用', stream?.active)
  // console.log('流的id唯一标识', stream?.id)
  // console.log('localvideo:', localvideo.value)
  localvideo.value!.srcObject = stream
  localvideo.value!.play()
  localStream.value = stream
  return stream
}

//发起方发起视频请求
const callRemote = async () => {
  if (!caller.value && !called.value) {
    // console.log('发起视频')
    //A向B发请求
    caller.value = true
    calling.value = true
    await getLocalStream()
    //传递房间号
    socket.value?.emit('callRemote', roomID)
  }
}
//接收方同意视频请求
const acceptCall = () => {
  if (called.value) {
    // console.log('同意视频邀请，连接服务器')
    //通过信令服务器通知用户A
    socket.value?.emit('acceptCall', roomID)
  }
}
//挂断视频
const hangUp = () => {
  // console.log('挂断视频')
  if (called.value) called.value = false
  if (caller.value) caller.value = false
  if (localvideo.value.srcObject) {
    const videoTracks = localvideo.value.srcObject.getVideoTracks()
    videoTracks.forEach((videoTrack: any) => {
      videoTrack.stop()
      localvideo.value.srcObject.removeTrack(videoTrack)
    })
  }

  if (remotevideo.value.srcObject) {
    const videoTracks = remotevideo.value.srcObject.getVideoTracks()
    videoTracks.forEach((videoTrack: any) => {
      videoTrack.stop()
      remotevideo.value.srcObject.removeTrack(videoTrack)
    })
    //挂断同时，通知对方
    socket.value?.emit('hangup', roomID)
  }
  if (peer) {
    peer.value.ontrack = null
    peer.value.onremovetrack = null
    peer.value.onremovestream = null
    peer.value.onicecandidate = null
    peer.value.oniceconnectionstatechange = null
    peer.value.onsignalingstatechange = null
    peer.value.onicegatheringstatechange = null
    peer.value.onnegotiationneeded = null
    peer.value.close()
    peer.value = null
  }
  localvideo.value.srcObject = null
  remotevideo.value.srcObject = null
}
</script>

<template>
  <div class="flex items-center flex-col text-center p-12 h-screen">
    <div class="relative h-full mb-4">
      <div class="h-full my">
        <video ref="localvideo" class="w-2/4 h-full mb-4 bg-gray-200 object-cover" autoplay></video>
        <video
          ref="remotevideo"
          class="w-64 h-48 absolute bottom-0 right-o object-cover"
          autoplay
        ></video>
      </div>
      <div v-if="caller && calling" class="absolute top-2/3 left-36 flex flex-col items-center">
        <p class="mb-4 text-white">等待对方接听...</p>
        <img @click="hangUp" src="/refuse.svg" class="w-16 cursor-pointer" alt="" />
      </div>
      <div v-if="called && calling" class="absolute top-2/3 left-32 flex flex-col items-center">
        <p class="mb-4 text-white">收到视频邀请...</p>
        <div class="flex">
          <img @click="hangUp" src="/refuse.svg" class="w-16 cursor-pointer mr-4" alt="" />
          <img @click="acceptCall" src="/accept.svg" class="w-16 cursor-pointer" alt="" />
        </div>
      </div>
    </div>
    <div class="flex gap-2 mb-4">
      <button
        class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
        @click="callRemote"
      >
        发起视频
      </button>
      <button
        class="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white"
        @click="hangUp"
      >
        挂断视频
      </button>
    </div>
  </div>
</template>

<style scoped>
.my {
  display: flex;
  flex-direction: row;
  justify-content: center;
}
</style>
