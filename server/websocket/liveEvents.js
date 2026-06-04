let io = null;

function init(socketIo) {
  io = socketIo;
}

function emit(event, data) {
  if (!io) return;
  try {
    io.emit(event, { ...data, _ts: Date.now() });
  } catch (err) {
    // Suppress emission errors
  }
}

function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, { ...data, _ts: Date.now() });
}

module.exports = { init, emit, emitToRoom };
