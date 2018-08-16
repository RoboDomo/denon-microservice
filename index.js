// denon-microservice

process.env.DEBUG = "DenonHost";

const debug = require("debug")("DenonHost"),
  net = require("net"),
  HostBase = require("microservice-core/HostBase");

const TOPIC_ROOT = process.env.TOPIC_ROOT || "denon",
  MQTT_HOST = process.env.MQTT_HOST,
  DENON_HOSTS = process.env.DENON_HOSTS.split(",");

const events = {
  PW: "PW",
  MVMAX: "MVMAX",
  MV: "MV",
  // MV:    (state, args) => {
  //     if (args.length === 2) {
  //         state.masterVolume = args + '.0'
  //     }
  //     else {
  //         state.masterVolume = args.substr(0, 2) + '.' + args.substr(2)
  //     }
  //     if (state.masterVolume[0] === '0') {
  //         state.masterVolume = state.masterVolume.substr(1)
  //     }
  // },
  // CV:    (state, args) => {
  //     const [key, value]       = args.split(' ')
  //     state[key] = value
  //     state.channelVolume[key] = value
  // },
  MU: "MU",
  SI: "SI",
  SD: "SD",
  DC: "DC",
  SV: "SV",
  MS: "MS"
  // MU:    'mute',
  // SI:    'inputSource',
  // SD:    'inputMode',
  // DC:    'digitalInputMode',
  // SV:    'videoSelect',
  // MS:    'surroundMode',
};

class DenonHost extends HostBase {
  // TODO: take a config
  constructor(host) {
    super(MQTT_HOST, TOPIC_ROOT + "/" + host);

    this.host = host;
    this.connect();
  }

  connect() {
    this.socket = new net.Socket();
    this.socket.setEncoding("ascii");
    this.buffer = "";
    this.socket.on("error", err => {
      debug(this.host, "error", err.message);
      this.socket.end();
      this.socket = null;
      this.connect();
    });
    debug("connecting", this.host, this.host);
    this.socket.connect(
      23,
      this.host,
      () => {
        debug("CONNECTED", this.host);
        this.write("SI?");
        this.write("PW?");
        this.write("MU?");
        this.write("MV?");
        this.write("SD?");
        this.write("MS?");
        this.write("PS?");
        this.write("MN?");
        this.write("CV?");
        this.write("SV?");
      }
    );
    this.socket.on("data", data => {
      this.buffer += data.toString();
      // debug(this.host, 'data', this.buffer, '\n')
      while (this.buffer.indexOf("\r") !== -1) {
        const lines = this.buffer.split("\r"),
          line = lines.shift();

        // debug('line', line)
        this.buffer = lines.join("\r");
        this.handleResponse(line);
        this.emit("denon", line);
      }
    });
  }

  handleResponse(line) {
    debug(this.host, "handleResoonse", line);
    const state = Object.assign({}, this.state || {});

    for (const key in events) {
      if (line.substr(0, key.length) === key) {
        const value = events[key];
        if (typeof value === "string") {
          state[value] = line.substr(key.length).replace(/^\s+/, "");
          this.state = state;
          return;
        } else {
          value(state, line.substr(key.length).replace(/^\s+/, ""));
          this.state = state;
          return;
        }
      }
    }
    // debug('unhandled', line)
    const [key, value] = line.split(" ");
    state[key] = value;
    this.state = state;
  }

  /**
   * Write a command to the socket, terminated with a carriage return.
   * @param cmd
   */
  write(cmd) {
    this.socket.write(cmd + "\r");
  }

  command(key, cmd) {
    this.write(cmd);
    if (cmd === "MUOFF") {
      this.handleResponse("MUOFF");
    } else if (cmd === "MUON") {
      this.handleResponse("MUON");
    }
  }
}

const receivers = {};

function main() {
  if (!MQTT_HOST) {
    console.log("ENV variable MQTT_HOST not found");
    process.exit(1);
  }
  if (!DENON_HOSTS || !DENON_HOSTS.length) {
    console.log("ENV variable DENON_HOSTS not found");
    process.exit(1);
  }
  DENON_HOSTS.forEach(host => {
    receivers[host] = new DenonHost(host);
  });
}

main();
