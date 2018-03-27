// Setup an AudioContext
const context = new AudioContext()
const source = context.createBufferSource()
source.connect(context.destination)

//
// "Interface" if you can call it one
//

const play = () => {
  // The first time playback starts, source.start() can kick it off.
  // After a pause, context.resume() must be used.
  try {
    source.start()
  } catch(e) {
    context.resume()
  }
}
const pause = () => context.suspend()

const fileInput = document.getElementById('file')
fileInput.addEventListener('change', () => {
  loadFile(fileInput.files[0])
})

const controls = document.getElementById('controls')
const statusMsg = document.getElementById('status')
const fileInfo = document.getElementById('fileInfo')
const sampleRateInfo = document.getElementById('sampleRate')
const bitDepthInfo = document.getElementById('bitDepth')
const channelInfo = document.getElementById('channels')
const lengthInfo = document.getElementById('length')

const playControl = document.getElementById('play')
playControl.onclick = play

const pauseControl = document.getElementById('pause')
pauseControl.onclick = pause

const enableInterface = (metadata) => {
  statusMsg.innerHTML = 'File loaded!'
  sampleRateInfo.innerHTML = metadata.sampleRate + 'Hz'
  bitDepthInfo.innerHTML = metadata.bitDepth + ' bits'
  channelInfo.innerHTML = metadata.numChannels
  lengthInfo.innerHTML = metadata.length + 's'

  fileInfo.style.display = 'block'
  controls.style.display = 'block'
}

const disableInterface = () => {
  statusMsg.innerHTML = 'Loading...'
  fileInfo.style.display = 'none'
  controls.style.display = 'none'
}

//
// File reading
//

const fileReader = new FileReader()

// Nice promise-based file reading interface
const readBytes = (file, start, end) => {
  return new Promise((resolve) => {
    const slice = file.slice(start, end)
    fileReader.readAsArrayBuffer(slice)
    fileReader.onload = () => resolve(fileReader.result)
  })
}

// Helper to read strings out of bytes
const arrayBufferToString = (buffer) => {
  const intArray = new Int8Array(buffer)
  const array = Array.from(intArray)
  return array.map(charCode => String.fromCharCode(charCode)).join('')
}

const loadFile = (file) => {
  disableInterface()

  // Keep track of important stuff read from the file
  const metadata = {
    formatSize: null,
    numChannels: null,
    sampleRate: null,
    bitDepth: null,
    formatEnd: null,
    length: null
  }

  readBytes(file, 0, 4).then(result => {
    // This should be "RIFF"
    if (arrayBufferToString(result) !== 'RIFF') throw new Error('Unsupported format.')
    return readBytes(file, 4, 8)
  }).then(result => {
    // Header chunk size, can ignore
    return readBytes(file, 8, 12)
  }).then(result => {
    // This should be "WAVE"
    if (arrayBufferToString(result) !== 'WAVE') throw new Error('Unsupported format.')
    return readBytes(file, 12, 16)
  }).then(result => {
    // This should be "fmt"
    if (arrayBufferToString(result) !== 'fmt ') throw new Error('Unsupported format.')
    return readBytes(file, 16, 20)
  }).then(result => {
    // Format chunk size. We'll need this later to figure out if we need to skip over some data.
    metadata.formatSize = new DataView(result).getInt32(0, true)
    return readBytes(file, 20, 22)
  }).then(result => {
    // Format. We expect this to be 1, which means PCM.
    const format = new DataView(result).getInt8(0, true)
    if (format !== 1) throw new Error('Unsupported format.')
    return readBytes(file, 22, 24)
  }).then(result => {
    // Number of channels. 1 = mono, 2 = stereo, etc.
    metadata.numChannels = new DataView(result).getInt8(0, true)
    return readBytes(file, 24, 28)
  }).then(result => {
    // Sample rate. e.g 44100Hz for CD-quality audio.
    metadata.sampleRate = new DataView(result).getInt32(0, true)
    return readBytes(file, 28, 32)
  }).then(result => {
    // Byte rate. Doesn't matter here.
    return readBytes(file, 32, 34)
  }).then(result => {
    // Block align. Doesn't matter either.
    return readBytes(file, 34, 36)
  }).then(result => {
    // Bit depth. e.g 16 for CD-quality audio.
    metadata.bitDepth = new DataView(result).getInt8(0, true)

    // This is a bit tricky. Everything in the format chunk after this is extra stuff we don't need
    // but we have to know how much extra stuff there is to skip. Thankfully, we read the
    // size of the format chunk before and stored it in metadata.formatSize. We have to add that to
    // where we read the format size (20) and that should get us the last byte to read up to.
    metadata.formatEnd = metadata.formatSize + 20
    return readBytes(file, 36, metadata.formatEnd)
  }).then(result => {
    return readBytes(file, metadata.formatEnd, metadata.formatEnd + 4)
  }).then(result => {
    // data start
    if (arrayBufferToString(result) !== 'data') throw new Error('Unsupported format.')
    return readBytes(file, metadata.formatEnd + 4, metadata.formatEnd + 8)
  }).then(result => {
    // Data size. We can use this to figure out how long this file is in seconds.
    const dataSize = new DataView(result).getInt32(0, true)
    metadata.length = dataSize / (metadata.sampleRate * metadata.numChannels * metadata.bitDepth / 8)

    // The rest of the file is data, so we can skip passing the "last byte" param to readBytes
    return readBytes(file, metadata.formatEnd + 8)
  }).then(result => {
    // Load the rest of the data into an AudioBuffer
    loadAudioBuffer(metadata, result)

    // We're ready to play music!
    enableInterface(metadata)
  })
}

const loadAudioBuffer = (metadata, arrayBuffer) => {
  // Turn our ArrayBuffer into a solid Array
  const ArrayToUse = eval('Int' + metadata.bitDepth + 'Array') // Barf
  const rawData = new ArrayToUse(arrayBuffer)

  // Initialize an empty buffer using metadata
  const buffer = context.createBuffer(metadata.numChannels, metadata.sampleRate * metadata.length, metadata.sampleRate)

  // Copy raw audio data into the buffer per channel
  for (let channel = 0; channel < metadata.numChannels; channel++) {
    const channelData = buffer.getChannelData(channel)

    for (let i = channel, channelPointer = 0; i < rawData.length; i += metadata.numChannels, channelPointer++) {
      channelData[channelPointer] = rawData[i] / 2 ** metadata.bitDepth
    }
  }

  // Tell the source to point to the now-filled up buffer
  source.buffer = buffer
}
