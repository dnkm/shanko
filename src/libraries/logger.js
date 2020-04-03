class Logger {
  reqLog(socket, u) {
    console.log(u, socket[0], socket[1]);

    // if (socket[1]) {
    //   console.log(
    //     new Date(new Date().toUTCString().substr(0, 25)),
    //     socket[0],
    //     socket[1]
    //   );
    // } else {
    //   console.log(
    //     new Date(new Date().toUTCString().substr(0, 25)),
    //     socket[0],
    //     "no params"
    //   );
    // }
  }

  respLog(name, payload, msg) {
    console.log(name, payload.bankerIndex, msg);
  }
}

module.exports = new Logger();
