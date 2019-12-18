class Logger {
  reqLog(socket) {
    if (socket[1].length !== 0) {
      console.log(
        new Date(new Date().toUTCString().substr(0, 25)),
        socket[0],
        socket[1]
      );
    } else {
      console.log(
        new Date(new Date().toUTCString().substr(0, 25)),
        socket[0],
        "no params"
      );
    }
  }

  respLog(name, payload, msg) {
    console.log(
      new Date(new Date().toUTCString().substr(0, 25)),
      name,
      JSON.stringify(payload),
      msg
    );
  }
}

module.exports = new Logger();
