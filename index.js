const fs = require('fs')

// Keep track of how many bytes we read so we can start playing music at the right place.
let bytesRead = 0
const filePath = "C:\Users\Ilya Rubnich\Music\Via Intercom - Buzz Buzz Buzz Vertigo\Via Intercom - Buzz Buzz Buzz Vertigo - 01 Helen.wav"

fs.open(filePath, 'r', (err, fd) => {
  const readBytes = (length) => new Promise((resolve) => {
    const buffer = new Buffer(length)
    fs.read(fd, buffer, 0, length, null, (err, num) => {
      bytesRead += num
      resolve(buffer);
    })
  })

  // Let's keep a list of all the metadata we'll need
  const metadata = {
    formatChunkSize: null,
    numChannels: null,
    sampleRate: null,
    bitsPerSample: null,
    length: null
  }

  readBytes(4).then((buffer) => {
    // Header starts here

    // RIFF
    console.log(buffer.toString())

    return readBytes(4)
  }).then((buffer) => {
    // This field contains the size of the file minus 8 bytes.
    // We have no use for it, but we gotta read it.
    return readBytes(4)
  }).then((buffer) => {
    // WAVE
    console.log(buffer.toString())

    return readBytes(4)
  }).then((buffer) => {
    // Format starts here

    // fmt
    console.log(buffer.toString())

    return readBytes(4)
  }).then((buffer) => {
    // This is the first piece of information we'll actually need.
    metadata.formatChunkSize = buffer[0]

    return readBytes(2)
  }).then((buffer) => {
    // This is the format of the file. This should be 1, which means PCM.
    // If it's not, we gotta bail cause this is a dumb script.
    const format = buffer[0]
    if (format !== 1) throw new Error("Unsupported format.")

    return readBytes(2)
  }).then((buffer) => {
    // This is the number of channels. 1 is mono, 2 is stereo.
    metadata.numChannels = buffer[0]

    return readBytes(4)
  }).then((buffer) => {
    // This is the sample rate. e.g 44100Hz
    metadata.sampleRate = buffer.readInt32LE()

    return readBytes(4)
  }).then((buffer) => {
    // Byte rate. We don't really care about this.
    return readBytes(2)
  }).then((buffer) => {
    // Block align. Needed for Java but not here.
    return readBytes(2)
  }).then((buffer) => {
    // Bits per sample. e.g 16
    metadata.bitsPerSample = buffer[0]

    // Read "the rest" of the format chunk
    return readBytes(metadata.formatChunkSize - 16)
  }).then((buffer) => {
    // Safe to discard extra bits.
    return readBytes(4)
  }).then((buffer) => {
    // Data starts here!
    console.log(buffer.toString())

    return readBytes(4)
  }).then((buffer) => {
    // This is the "data size" field.
    // We can use it to calculate how long the file is in seconds.
    const dataSize = buffer.readInt32LE()
    metadata.length = dataSize / (metadata.sampleRate * metadata.numChannels * metadata.bitsPerSample / 8)

    // Print out all our fun metadata
    console.log(metadata)

    // We can start playing music here
    const speaker = new Speaker({
      channels: metadata.numChannels,
      bitDepth: metadata.bitsPerSample,
      sampleRate: metadata.sampleRate,
      signed: true
    })

    const stream = fs.createReadStream(filePath, { start: bytesRead })
    stream.pipe(speaker)
  })
})
