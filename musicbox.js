/* globals Croquet */

const BallDiameter = 25;
let audioContext = null;

class MusicBoxModel extends Croquet.Model {
    init(options) {
        super.init(options);
        this.width = 720;
        this.height = 480;
        this.wrapTime = 0;
        this.balls = new Map();
        this.currentId = 0;

        // {x: normalizedPos, n: note}. x is normalized to [0, width - BallDiameter * 2]. f is converted to y which is with in (height - BallDiameter... 0)
        [
            {x: 0.000, n: 'C'},
            {x: 0.125, n: 'D'},
            {x: 0.250, n: 'E'},
            {x: 0.375, n: 'F'},
            {x: 0.500, n: 'G'},
            {x: 0.625, n: 'A'},
            {x: 0.750, n: 'B'},
            {x: 0.875, n: 'C^'},
        ].forEach(obj => {
            this.balls.set(this.currentId++, {
                x: obj.x * (this.width - BallDiameter * 2),
                y: this.height - (ftop(stof(obj.n)) * (this.height - BallDiameter * 2)) - BallDiameter * 2,
                grabbed: null});
        });

        this.future(2000).wrap();
        this.subscribe(this.id, "grab", this.grab);
        this.subscribe(this.id, "move", this.move);
        this.subscribe(this.id, "release", this.release);
        this.subscribe(this.id, "addBall", this.addBall);
        this.subscribe(this.id, "removeBall", this.removeBall);
        this.subscribe(this.sessionId, "view-exit", this.deleteUser);
    }

    deleteUser(viewId) {
        this.balls.forEach(value => {
            if (value.grabbed === viewId) {
                value.grabbed = null;
            }
        });
    }

    grab(data) {
        const {viewId, id} = data;
        const ball = this.balls.get(id);
        if (!ball) {return;}
        if (ball.grabbed) {return;}
        ball.grabbed = viewId;
        this.publish(this.id, "grabbed", data);
    }

    move(data) {
        const {viewId, id, x, y} = data;
        const ball = this.balls.get(id);
        if (!ball) {return;}
        if (ball.grabbed !== viewId) {return;}
        ball.x = x;
        ball.y = y;
        this.publish(this.id, "moved", data);
    }

    release(data) {
        const {viewId, id} = data;
        const ball = this.balls.get(id);
        if (!ball) {return;}
        if (ball.grabbed !== viewId) {return;}
        ball.grabbed = null;
        ball.x = Math.min(ball.x, this.width - BallDiameter);
        this.publish(this.id, "released", data);
    }

    addBall(data) {
        const id = this.currentId++;
        const x = data.x || this.width / 2;
        const y = data.y || this.width / 2;
        this.balls.set(id, {x, y, grabbed:null});

        const result = {...data, id};
        this.publish(this.id, "added", result);
    }

    removeBall(data) {
        const {viewId, id} = data;
        const ball = this.balls.get(id);
        if (!ball) {return;}
        if (ball.grabbed !== viewId) {return;}
        this.balls.delete(id);

        this.publish(this.id, "removed", {viewId, id});
    }

    wrap() {
        this.wrapTime = this.now() / 1000.0;
        this.future(2000).wrap();
        this.publish(this.id, "wrap", this.wrapTime);
    }
}

MusicBoxModel.register("MusicBoxModel");

class MusicBoxView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;
        this.wrapTime = 0;
        this.lastWrapTime = this.wrapTime;
        this.lastWrapRealTime = Date.now();
        this.barPos = 0;

        this.grabInfo = new Map();
        this.viewBalls = new Map(model.balls);
        this.balls = null; // will be a Map() <id, dom>

        this.subscribe(this.model.id, "wrap", time => this.wrapTime = time);
        this.subscribe(this.model.id, "grabbed", data => this.grabBall(data));
        this.subscribe(this.model.id, "moved", data => this.moveBall(data));
        this.subscribe(this.model.id, "released", data => this.releaseBall(data));
        this.subscribe(this.model.id, "added", data => this.addBall(data));
        this.subscribe(this.model.id, "removed", data => this.removeBall(data));

        this.field = window.document.querySelector("#field");
        this.bar = window.document.querySelector("#bar");
        this.addContainer = window.document.querySelector("#addContainer");

        this.addContainer.addEventListener("click", () => this.addingBall());
        this.field.addEventListener("pointerdown", evt => this.pointerDown(evt));
        this.field.addEventListener("pointermove", evt => this.pointerMove(evt));
        this.field.addEventListener("pointerup", evt => this.pointerUp(evt));

        this.initializeBalls();
        window.view = this;
    }

    initializeBalls() {
        this.balls = new Map();
        for (const id of this.viewBalls.keys()) {
            this.newBall(id);
        }
    }

    detach() {
        super.detach();
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
    }

    newBall(id) {
        const ball = document.createElement("div");
        ball.classList.add("piece");
        this.balls.set(id, ball);
        this.field.appendChild(ball);
        this.updateBall(id);
    }

    grabBall(data, viewSide) {
        const {viewId, id} = data;
        if (!viewSide && viewId === this.viewId) {return;}

        const ball = this.viewBalls.get(id);
        this.viewBalls.set(id, {...ball, grabbed: viewId});
        this.updateBall(id);
    }

    moveBall(data, viewSide) {
        const {viewId, id, x, y} = data;
        if (!viewSide && viewId === this.viewId) {return;}
        this.viewBalls.set(id, {x, y, grabbed: viewId});
        this.updateBall(id);
    }

    releaseBall(data, viewSide) {
        const {viewId, id} = data;
        if (viewSide && viewId === this.viewId) {return;}
        const ball = this.viewBalls.get(id);
        if (ball) {
            this.viewBalls.set(id, {...ball, grabbed: null});
            this.updateBall(id);
        }
    }

    addBall(data) {
        const {id, x, y} = data;
        this.viewBalls.set(id, {x, y, grabbed: null});
        this.newBall(id);
    }

    removeBall(data) {
        const {id} = data;
        this.viewBalls.delete(id);
        const ball = this.balls.get(id);
        if (ball) {
            ball.remove();
            this.balls.delete(id);
        }
    }

    findBall(x, y, balls) {
        const entries = Array.from(balls.entries());
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            const diffX = (entry[1].x + BallDiameter) - x;
            const diffY = (entry[1].y + BallDiameter) - y;
            if ((diffX * diffX + diffY * diffY) <= BallDiameter ** 2) {
                return entry;
            }
        }
        return null;
    }

    addingBall() {
        this.publish(this.model.id, "addBall", {
            viewId: this.viewId,
            x: BallDiameter * 2,
            y: BallDiameter * 2,
        });
    }

    updateBall(id) {
        const ballData = this.viewBalls.get(id);
        if (!ballData) {return;}

        const ball = this.balls.get(id);
        if (!ball) {return;}

        const border = !ballData.grabbed ? "" : (ballData.grabbed === this.viewId ? "1px solid red" : "1px solid black");
        const transform = `translate(${ballData.x}px, ${ballData.y}px)`;

        ball.style.setProperty("border", border);
        ball.style.setProperty("transform", transform);
    }

    pointerDown(evt) {
        enableSound();
        const x = evt.offsetX;
        const y = evt.offsetY;
        const pointerId = evt.pointerId;
        const balls = this.model.balls;
        const entry = this.findBall(x, y, balls);
        if (!entry) {return;}
        const [ballId, ballData] = entry;
        if (ballData.grabbed && ballData.grabbed !== this.viewId) {return;}
        const info = this.grabInfo.get(pointerId);
        if (info) {return;}
        const g = {ballId: entry[0], grabPoint: {x, y}, translation: {x: ballData.x, y: ballData.y}};

        this.grabInfo.set(evt.pointerId, g);
        this.viewBalls.get(ballId).grabbed = this.viewId;
        this.publish(this.model.id, "grab", {viewId: this.viewId, id: ballId});
        this.updateBall(ballId);
        evt.target.setPointerCapture(evt.pointerId);
    }

    pointerMove(evt) {
        if (evt.buttons === 0) {return;}
        const pointerId = evt.pointerId;
        const info = this.grabInfo.get(pointerId);
        if (!info) {return;}

        const ball = this.model.balls.get(info.ballId);
        if (!ball) {return;}
        if (ball.grabbed && ball.grabbed !== this.viewId) {return;}

        let x = evt.offsetX - info.grabPoint.x + info.translation.x;
        let y = evt.offsetY - info.grabPoint.y + info.translation.y;
        if (x <= 0) {x = 0;}
        // if (x > model.width - BallDiameter) {x = model.width - BallDiameter;}
        if (y <= 0) {y = 0;}
        if (y > this.model.height - BallDiameter * 2) {y = this.model.height - BallDiameter * 2;}

        this.viewBalls.set(info.ballId, {x, y, grabbed: info.grabbed});
        this.publish(this.model.id, "move", {viewId: this.viewId, id: info.ballId, x, y});
        this.updateBall(info.ballId);
    }

    pointerUp(evt) {
        const pointerId = evt.pointerId;
        evt.target.releasePointerCapture(pointerId);
        const info = this.grabInfo.get(pointerId);
        if (!info) {return;}

        this.grabInfo.delete(evt.pointerId);
        if (this.viewBalls.get(info.ballId)) {
            this.viewBalls.get(info.ballId).grabbed = null;
        }

        const ballData = this.viewBalls.get(info.ballId);
        if (!ballData) {return;}
        if (ballData.x > this.model.width) {
            this.publish(this.model.id, "removeBall", {viewId: this.viewId, id: info.ballId});
        }
        this.publish(this.model.id, "release", {viewId: this.viewId, id: info.ballId});
        this.updateBall(info.ballid);
    }

    update(_time) {
        const updateNow = Date.now();
        const barTiming = (updateNow - this.lastWrapRealTime) / 2000;
        const newBarPos = barTiming * this.model.width; // be [0..model.width+)
        const toPlay = [];
        const oldBarPos = this.barPos;
        this.viewBalls.forEach(ballData => {
            if ((oldBarPos <= ballData.x && ballData.x < newBarPos) ||
                (oldBarPos > newBarPos && ballData.x < newBarPos)) {
                toPlay.push((this.model.height - ballData.y) / this.model.height);
            }
        });
        playSound(toPlay);
        this.barPos = newBarPos;
        this.bar.style.setProperty("transform", `translate(${newBarPos}px, 0px)`);

        if (this.lastWrapTime !== this.wrapTime) {
            this.lastWrapTime = this.wrapTime;
            const now = Date.now();
            this.lastWrapRealTime = now;
        }

        const scale = Math.min(1, window.innerWidth / this.model.width, window.innerHeight / this.model.height);

        this.field.style.transform = `scale(${scale})`;
        this.field.style.width = `${this.model.width}px`;
        this.field.style.height = `${this.model.height}px`;
    }

    synced(flag) {
        console.log("synced", flag, this.barPos);
    }
}

function enableSound() {
    if (audioContext) {return;}
    if (window.AudioContext) {
        audioContext = new window.AudioContext();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }
}

function stof(s) {
    const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C^'];
    const index = scale.indexOf(s);
    return 1.0594630943592953 ** index * 261.63;
}

function ftop(f) {
    // log_1.059 p = log p / log 1.059
    const p = f / 261.63;
    return Math.log(p) / Math.log(1.0594630943592953) / 12.0;
}

function ptof(p) {
    return 1.0594630943592953 ** (p * 12) * 261.63;
}

function playSound(toPlay) {
  if (!audioContext) {return;}
  const now = audioContext.currentTime;
  toPlay.forEach(p => {
    if (!audioContext) {return;}// a dubious line
    const f = ptof(p);
    const o = audioContext.createOscillator();
    o.type = "sine";

    o.frequency.setValueAtTime(f, now);

    const g = audioContext.createGain();
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.2, now + 0.1);
    o.connect(g);
    g.connect(audioContext.destination);
    o.start(0, 0, 2);

    const stopTone = () => {
      if (!audioContext) {return;}
      const future = audioContext.currentTime;
      //g.gain.cancelScheduledValues(future);
      g.gain.setValueAtTime(g.gain.value, future);
      g.gain.exponentialRampToValueAtTime(0.00001, future + 1.0);
      o.stop(future + 1);
    };
    setTimeout(stopTone, 100);
  });
}

Croquet.Session.join({
    apiKey: "1_k2xgbwsmtplovtjbknerd53i73otnqvlwwjvix0f",
    appId: "io.croquet.library.musicbox",
    name: Croquet.App.autoSession("q"),
    password: "abc",
    model: MusicBoxModel,
    view: MusicBoxView,
    eventRateLimit: 60,
    tps: 10
}).then(context => {
    window.session = context;
});
