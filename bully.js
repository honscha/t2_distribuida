var fs = require("fs");
var dgram = require("dgram");
var lineReader = require("line-reader");

let myNode;
let nodes = [];
let writterNode;
let bully;
let waitingReturn = false;
let locked = false;
let imTheBully;
let imLocked = false;

start();

function start() {
  let lineAux = 0;
  lineReader.eachLine(process.argv[2], function(line, last) {
    lineAux++;
    let node;
    let info = line.split(" ");
    node = {
      id: info[0],
      address: info[1],
      port: info[2]
    };
    if (node.id == 0) {
      writterNode = node;
      if (lineAux == process.argv[3]) writterNodeListen(node);
    } else {
      nodes.push(node);
      if (lineAux == process.argv[3]) {
        myNode = node;
        serverListen(node.port, node.address);
      }
    }
    if (last) {
      if (lineAux == process.argv[3]) {
        imTheBully = true;
      }
      bully = node;
    }
  });
}

function writterNodeListen(node) {
  const server = dgram.createSocket("udp4");

  const stdin = process.openStdin();

  server.on("listening", function() {
    const address = server.address();
    console.log(
      "UDP Server listening on " + address.address + ":" + address.port
    );
  });

  server.on("message", function(message, remote) {
    let retorno = JSON.parse(message.toString());
    console.log(retorno);
    switch (retorno.type) {
      case "write":
        fs.appendFile("writefile.txt", retorno.content + "\n", function(
          err
        ) {});
        break;
    }
  });

  server.bind(node.port, node.address);
}

function serverListen(port, address) {
  const server = dgram.createSocket("udp4");

  const stdin = process.openStdin();

  server.on("listening", function() {
    const address = server.address();
    console.log(
      "UDP Server listening on " + address.address + ":" + address.port
    );
  });

  server.on("message", function(message, remote) {
    let retorno = JSON.parse(message.toString());
    waitingReturn = false;
    let buffer;
    switch (retorno.type) {
      case "lock":
        lockControl(retorno.content, remote, server);
        break;
      case "unlock":
        if (retorno.content == locked) {
          locked = false;
        }
        break;
      case "locked":
        imLocked = true;
        buffer = buildMessage(
          "write",
          `ID: ${myNode.id} ACTION:lock DATE:${new Date()}`
        );
        server.send(
          buffer,
          0,
          buffer.length,
          writterNode.port,
          writterNode.address,
          function(err) {
            if (err) throw err;
          }
        );
        break;
      case "lockError":
        console.log("Não ganhou lock");
        break;
      case "newBully":
        let id = retorno.content;
        bully = nodes.filter(node => node.id == id)[0];
        console.log("NEW BULLY: " + id);
        break;
      case "AITBN":
        buffer = buildMessage("NOTBULLY");
        server.send(
          buffer,
          0,
          buffer.length,
          remote.port,
          remote.address,
          function(err) {
            if (err) throw err;
          }
        );
        startElection(server);
        break;
      case "NOTBULLY":
        imTheBully = false;
        break;
    }
  });

  stdin.addListener("data", function(d) {
    let message = d.toString().trim();
    let buffer;
    switch (message) {
      case "lock":
        waitingReturn = true;
        setTimeout(() => {
          if (waitingReturn) {
            console.log("Start election");
            startElection(server);
          }
          if (imLocked) {
            imLocked = false;
            buffer = buildMessage("unlock", myNode.id);
            server.send(
              buffer,
              0,
              buffer.length,
              bully.port,
              bully.address,
              function(err) {
                if (err) throw err;
              }
            );
            buffer = buildMessage(
              "write",
              `ID: ${myNode.id} ACTION:unlock DATE:${new Date()}`
            );
            server.send(
              buffer,
              0,
              buffer.length,
              writterNode.port,
              writterNode.address,
              function(err) {
                if (err) throw err;
              }
            );
          }
        }, 3000);
        buffer = buildMessage("lock", myNode.id);
        server.send(
          buffer,
          0,
          buffer.length,
          bully.port,
          bully.address,
          function(err) {
            if (err) throw err;
          }
        );
        break;
      case "unlock":
        if (imLocked) {
          imLocked = false;
          buffer = buildMessage("unlock", myNode.id);
          server.send(
            buffer,
            0,
            buffer.length,
            bully.port,
            bully.address,
            function(err) {
              if (err) throw err;
            }
          );
          buffer = buildMessage(
            "write",
            `ID: ${myNode.id} ACTION:unlock DATE:${new Date()}`
          );
          server.send(
            buffer,
            0,
            buffer.length,
            writterNode.port,
            writterNode.address,
            function(err) {
              if (err) throw err;
            }
          );
        }
        break;
    }
  });
  server.bind(port, address);
}

function startElection(server) {
  nodes
    .filter(node => node.id > myNode.id)
    .forEach(node => {
      let buffer = buildMessage("AITBN");
      server.send(buffer, 0, buffer.length, node.port, node.address, function(
        err
      ) {
        if (err) throw err;
      });
    });
  if (!imTheBully) {
    setTimeout(() => {
      if (imTheBully) {
        console.log("oi");
        nodes.forEach(node => {
          let buffer = buildMessage("newBully", myNode.id);
          server.send(
            buffer,
            0,
            buffer.length,
            node.port,
            node.address,
            function(err) {
              if (err) throw err;
            }
          );
        });
      }
    }, 3000);
  }
  imTheBully = true;
}

function buildMessage(type, content) {
  return new Buffer.from(
    JSON.stringify({
      type,
      content
    })
  );
}

function lockControl(id, remote, server) {
  let buffer;
  if (locked) {
    buffer = buildMessage("lockError");
  } else {
    setTimeout(() => {
      locked = false;
    }, 3000);
    locked = id;
    buffer = buildMessage("locked");
  }
  server.send(buffer, 0, buffer.length, remote.port, remote.address, function(
    err
  ) {
    if (err) throw err;
  });
}
