const config = {
    type: Phaser.AUTO,
    width: 480,
    height: 640,
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    pixelArt: true
};

const game = new Phaser.Game(config);

let road;
let car;
let trailer;
let cursors;
// WASD keys
let keyA, keyD, keyW, keyS;

let obstacles;
let speed = 1; 
let score = 0;
let scoreText;
let multiplierText; 
let highScoreText;
let gameOver = false;
let nextSpawnTime = 0;
let highScores = [];
let engineSound; // Oscillator for engine noise

let ufo;
let ufoBeam;
let ufoActive = false;
let ufoState = 'idle';
let ufoTimer = 0;
let ufoHoverCount = 0;
let ufoSound; 
let ufoGainNode;
let ufoLFO;
let ufoLFOGain;

let ufoTargetX = 0;
let ufoTargetY = 0;
let ufoAttackCount = 0;
let nextUfoSpawnTime = 0;

// Make function global so HTML can call it
window.submitHighScore = submitHighScore;
window.skipHighScore = skipHighScore; // New skip function

function preload() {
    // Debug loading errors
    this.load.on('loaderror', function(file) {
        console.log('Error loading asset:', file.key);
    });

    this.load.image('road', 'assets/road.png');
    this.load.image('car', 'assets/car.png');
    this.load.image('trailer', 'assets/trailer.png');
    this.load.image('tumbleweed', 'assets/tumbleweed.png');
    this.load.image('rock', 'assets/rock.png');
    this.load.image('turtle', 'assets/turtle.png');
    this.load.image('tree', 'assets/tree.png');
    this.load.image('ufo', 'assets/ufo.png');
    this.load.audio('bgm', 'assets/8bit_radio.mp3');
}

function create() {
    // Load High Scores
    const storedScores = localStorage.getItem('highScores');
    if (storedScores) {
        highScores = JSON.parse(storedScores);
    }

    // 1. Audio
    // Create procedural engine sound (Web Audio API)
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        const ctx = new AudioContext();
        engineSound = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        // Setup Sawtooth wave for buzzy motor
        engineSound.type = 'sawtooth';
        engineSound.frequency.value = 60; // Lower base idle pitch (was 100)
        
        // Connect
        engineSound.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        // Lower volume so it's not ear-splitting
        gainNode.gain.value = 0.007; // Even quieter (was 0.009)
        
        // Start
        engineSound.start();

        // --- UFO Sound Setup ---
        ufoSound = ctx.createOscillator();
        ufoSound.type = 'sine';
        ufoSound.frequency.value = 400;
        
        ufoGainNode = ctx.createGain();
        ufoGainNode.gain.value = 0; // Start muted
        
        // LFO for wobble
        ufoLFO = ctx.createOscillator();
        ufoLFO.type = 'sine';
        ufoLFO.frequency.value = 5; // 5Hz wobble
        
        ufoLFOGain = ctx.createGain();
        ufoLFOGain.gain.value = 50; // Depth of wobble
        
        ufoLFO.connect(ufoLFOGain);
        ufoLFOGain.connect(ufoSound.frequency);
        
        ufoSound.connect(ufoGainNode);
        ufoGainNode.connect(ctx.destination);
        
        ufoSound.start();
        ufoLFO.start();
    }

    // Play music if loaded successfully (Background Radio)
    if (this.cache.audio.exists('bgm')) {
        const music = this.sound.add('bgm', { loop: true, volume: 0.5 });
        // Increased randomization to 660 seconds (11 minutes)
        const randomStart = Phaser.Math.FloatBetween(0, 660); 
        music.play({ seek: randomStart });
    }

    // 2. Road
    road = this.add.tileSprite(240, 320, 480, 640, 'road');
    road.setTileScale(1.0);
    road.tilePositionX += 260; 

    // 2. Groups
    obstacles = this.physics.add.group();

    // 3. Trailer
    trailer = this.physics.add.sprite(240, 500, 'trailer');
    trailer.setScale(0.13); 
    trailer.body.setSize(trailer.width * 0.5, trailer.height * 0.5);

    // 4. Car
    car = this.physics.add.sprite(240, 400, 'car');
    car.setScale(0.13);
    car.body.setSize(car.width * 0.5, car.height * 0.6);
    car.setCollideWorldBounds(true);

    // 5. Controls
    cursors = this.input.keyboard.createCursorKeys();
    keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);

    // 6. UI
    scoreText = this.add.text(16, 16, 'Score: 0', { 
        fontSize: '20px', 
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4
    });

    multiplierText = this.add.text(16, 46, '', { 
        fontSize: '18px', 
        fill: '#ffd700', 
        stroke: '#000000',
        strokeThickness: 4,
        fontStyle: 'bold'
    });

    highScoreText = this.add.text(240, 200, '', { 
        fontSize: '18px', 
        fill: '#ffffff',
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center'
    });
    highScoreText.setOrigin(0.5);
    highScoreText.setVisible(false);

    nextSpawnTime = this.time.now + 2000;

    // 8. Collisions
    this.physics.add.overlap(car, obstacles, hitObstacle, null, this);
    this.physics.add.overlap(trailer, obstacles, hitObstacle, null, this);

    // 9. UFO
    ufo = this.physics.add.sprite(-100, -100, 'ufo');
    ufo.setScale(0.15);
    ufo.setVisible(false);
    ufo.setDepth(20); // Top layer
    ufo.body.setCircle(ufo.width * 0.35); // Circular hitbox
    ufo.body.setOffset(ufo.width * 0.15, ufo.height * 0.15);

    ufoBeam = this.add.graphics();
    ufoBeam.setDepth(19);
}

function update() {
    if (gameOver) {
        // Only allow space restart if NOT showing input form
        const form = document.getElementById('highscore-form');
        // Check if hidden (can be 'none' or empty string if defined in CSS)
        if (form.style.display !== 'block') {
            if (cursors.space.isDown || this.input.activePointer.isDown) {
                restartGame(this);
            }
        }
        return;
    }

    // --- 1. Scroll Road ---
    let currentSpeed = speed;
    
    const pointer = this.input.activePointer;
    const isTouch = pointer.isDown;

    if (cursors.up.isDown || keyW.isDown) currentSpeed += 4; 
    if (cursors.down.isDown || keyS.isDown) currentSpeed -= 0.5; 

    // Touch Speed Controls
    if (isTouch) {
        if (pointer.y < 320) {
            currentSpeed += 4; // Top half = Boost
        } else if (pointer.y > 500) {
            currentSpeed -= 0.5; // Bottom area = Brake
        }
    }

    if (currentSpeed < 0.5) currentSpeed = 0.5;
    if (currentSpeed > 3) currentSpeed = 3;

    // Update engine pitch based on speed
    if (engineSound) {
        // Base 60Hz + (Speed * 20) -> 60Hz to 120Hz range (Less whine at high speed)
        engineSound.frequency.value = 60 + (currentSpeed * 20);
    }

    // Update UFO Sound
    if (ufoSound && ufoGainNode) {
        const ctx = engineSound.context;
        if (ufoActive && !gameOver) {
             ufoGainNode.gain.setTargetAtTime(0.05, ctx.currentTime, 0.1);
             
             if (ufoState === 'approaching') {
                 ufoSound.type = 'sine';
                 ufoSound.frequency.setTargetAtTime(600, ctx.currentTime, 0.1);
                 ufoLFO.frequency.value = 5;
             } else if (ufoState === 'locking') {
                 ufoSound.frequency.setTargetAtTime(800, ctx.currentTime, 0.1);
                 ufoLFO.frequency.value = 10;
             } else if (ufoState === 'charging') {
                 ufoSound.frequency.setTargetAtTime(1000, ctx.currentTime, 0.1);
                 ufoLFO.frequency.value = 20; // Fast wobble
             } else if (ufoState === 'firing') {
                 ufoSound.type = 'sawtooth'; // Buzzy beam
                 ufoSound.frequency.setTargetAtTime(200, ctx.currentTime, 0.1);
                 ufoLFO.frequency.value = 50; 
             }
        } else {
             ufoGainNode.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        }
    }

    road.tilePositionY -= currentSpeed * 2; 

    // Multiplier
    let multiplier = 1;
    if (currentSpeed >= 2) multiplier = 2;

    scoreText.setText('Score: ' + score);
    
    if (multiplier > 1) {
        multiplierText.setVisible(true);
        multiplierText.setText('MULTIPLIER x2!');
        multiplierText.setStyle({ fill: '#ffd700' });
        multiplierText.x = 16 + Phaser.Math.Between(-1, 1);
        multiplierText.y = 46 + Phaser.Math.Between(-1, 1);
    } else {
        multiplierText.setVisible(false);
    }

    // --- 2. Car Movement ---
    car.setVelocity(0);
    let moveLeft = cursors.left.isDown || keyA.isDown;
    let moveRight = cursors.right.isDown || keyD.isDown;

    // Touch Steering
    if (isTouch) {
        if (pointer.x < 240) moveLeft = true;
        else moveRight = true;
    }

    if (moveLeft) {
        car.setVelocityX(-200);
        car.setAngle(-5);
    } else if (moveRight) {
        car.setVelocityX(200);
        car.setAngle(5);
    } else {
        car.setAngle(0);
    }

    // --- Rough Terrain Shake ---
    if (car.x < 160 || car.x > 320) {
        car.x += Phaser.Math.Between(-2, 2);
        car.y += Phaser.Math.Between(-2, 2);
    }

    // --- 3. Trailer Physics ---
    const targetX = car.x;
    const targetY = car.y + 120;
    trailer.x = Phaser.Math.Linear(trailer.x, targetX, 0.08);
    trailer.y = Phaser.Math.Linear(trailer.y, targetY, 0.08);

    if (trailer.x < 160 || trailer.x > 320) {
        trailer.x += Phaser.Math.Between(-2, 2);
        trailer.y += Phaser.Math.Between(-2, 2);
    }

    let sway = (car.x - trailer.x) * 0.30;
    trailer.setAngle(sway * 3);

    // --- 4. UFO Logic ---
    if (score >= 2000 && !ufoActive && !gameOver) {
        // First time spawn check
        if (nextUfoSpawnTime === 0) nextUfoSpawnTime = this.time.now;

        if (this.time.now > nextUfoSpawnTime) {
            ufoActive = true;
            ufoState = 'approaching';
            ufo.setPosition(car.x, -100);
            ufo.setVisible(true);
            ufoTimer = 0;
            ufoHoverCount = 3; // Hover 3 times
            ufoAttackCount = 0;
            
            // Initial random target
            ufoTargetX = Phaser.Math.Between(100, 380);
            ufoTargetY = Phaser.Math.Between(100, 300);
        }
    }

    if (ufoActive && !gameOver) {
        if (ufoState === 'approaching') {
             // Move to random target slowly
             ufo.x = Phaser.Math.Linear(ufo.x, ufoTargetX, 0.02);
             ufo.y = Phaser.Math.Linear(ufo.y, ufoTargetY, 0.02);
             
             ufo.angle = Math.sin(this.time.now / 300) * 5; // Slow wobble

             if (Phaser.Math.Distance.Between(ufo.x, ufo.y, ufoTargetX, ufoTargetY) < 30) {
                 // Reached target
                 ufoHoverCount--;
                 if (ufoHoverCount > 0) {
                     // Pick new target
                     ufoTargetX = Phaser.Math.Between(100, 380);
                     ufoTargetY = Phaser.Math.Between(100, 300);
                 } else {
                     ufoState = 'locking';
                 }
             }
        } else if (ufoState === 'locking') {
            // Move to above car
            const targetX = car.x;
            const targetY = car.y - 200;
            
            ufo.x = Phaser.Math.Linear(ufo.x, targetX, 0.05);
            ufo.y = Phaser.Math.Linear(ufo.y, targetY, 0.05);
            
            if (Phaser.Math.Distance.Between(ufo.x, ufo.y, targetX, targetY) < 10) {
                ufoState = 'charging';
                ufoTimer = 0;
            }
        } else if (ufoState === 'charging') {
            // 3 Second Warning (Yellow Beam)
            ufoTimer++;
            
            ufoBeam.clear();
            if (this.time.now % 200 < 100) { // Flicker effect
                ufoBeam.fillStyle(0xffff00, 0.3); // Yellow
                ufoBeam.beginPath();
                ufoBeam.moveTo(ufo.x, ufo.y + 20);
                ufoBeam.lineTo(ufo.x - 40, 700);
                ufoBeam.lineTo(ufo.x + 40, 700);
                ufoBeam.closePath();
                ufoBeam.fillPath();
            }

            if (ufoTimer > 180) { // 3 Seconds (60fps * 3)
                ufoState = 'firing';
                ufoTimer = 0;
            }
        } else if (ufoState === 'firing') {
             // Deadly Beam (Green)
             ufoTimer++;
             
             ufoBeam.clear();
             ufoBeam.fillStyle(0x00ff00, 0.6); // Green
             ufoBeam.beginPath();
             ufoBeam.moveTo(ufo.x, ufo.y + 20);
             ufoBeam.lineTo(ufo.x - 40, 700);
             ufoBeam.lineTo(ufo.x + 40, 700);
             ufoBeam.closePath();
             ufoBeam.fillPath();
             
             // Check Collision
             if (car.x > ufo.x - 40 && car.x < ufo.x + 40) {
                 hitObstacle.call(this, car, ufo);
             }

             if (ufoTimer > 60) { // 1 Second duration
                 ufoAttackCount++;
                 if (ufoAttackCount < 3) {
                     // Try again
                     ufoState = 'approaching';
                     ufoHoverCount = 3; 
                     ufoTimer = 0;
                     // Pick new target immediately
                     ufoTargetX = Phaser.Math.Between(100, 380);
                     ufoTargetY = Phaser.Math.Between(100, 300);
                 } else {
                     // Done, leave
                     ufoState = 'leaving';
                 }
             }
        } else if (ufoState === 'leaving') {
             ufo.y -= 3;
             ufoBeam.clear();
             if (ufo.y < -100) {
                 ufoActive = false;
                 ufo.setVisible(false);
                 ufoState = 'idle';
                 // Return in 10-20 seconds
                 nextUfoSpawnTime = this.time.now + Phaser.Math.Between(10000, 20000);
             }
        }
    } else {
        ufoBeam.clear();
    }

    // --- 4. Spawning Logic ---
    if (this.time.now > nextSpawnTime) {
        spawnObstacle();
        let delay = (1500 / (currentSpeed * 0.8)) + Phaser.Math.Between(-100, 100);
        if (delay < 300) delay = 300; 
        nextSpawnTime = this.time.now + delay;
    }

    // --- 5. Move Obstacles ---
    obstacles.children.iterate((child) => {
        if (child && child.active) {
            child.y += currentSpeed * 2; // Match road scrolling speed (was just currentSpeed)
            
            if (child.y > 700) {
                if (!child.scored) {
                    child.scored = true; 
                    let points = 0;
                    if (child.texture.key === 'rock' || child.texture.key === 'tree') {
                        points = 100;
                    } else if (child.texture.key === 'turtle') {
                        points = 200;
                    } else {
                        points = 50;
                    }
                    score += points * multiplier;
                    
                    // Pulse effect on score text
                    this.tweens.add({
                        targets: scoreText,
                        scale: 1.2,
                        duration: 100,
                        yoyo: true,
                        ease: 'Power1'
                    });
                }
                child.destroy();
            }
        }
    });
}

function spawnObstacle() {
    if (gameOver) return;

    // Randomize between types with weights
    // Tumbleweed: 35%
    // Rock: 30%
    // Tree: 25%
    // Turtle: 10% (Rare)
    const rand = Phaser.Math.Between(0, 99);
    let type, x;

    if (rand < 35) {
        type = 'tumbleweed';
        x = Phaser.Math.Between(50, 430); // Anywhere
    } else if (rand < 65) {
        type = 'rock';
        x = Phaser.Math.Between(160, 320); // Road only
    } else if (rand < 90) {
        type = 'tree';
        // Desert only (Left or Right of road)
        if (Phaser.Math.Between(0, 1) === 0) {
            x = Phaser.Math.Between(20, 130); // Left desert
        } else {
            x = Phaser.Math.Between(350, 460); // Right desert
        }
    } else {
        type = 'turtle';
        x = Phaser.Math.Between(160, 320); // Road only
    }
    
    const obstacle = obstacles.create(x, -50, type);
    obstacle.scored = false;
    
    // 1. Scale & Size
    if (type === 'tree') {
        obstacle.setScale(0.15); // Reduced scale again (was 0.18)
        obstacle.body.setSize(obstacle.width * 0.3, obstacle.height * 0.3);
        obstacle.body.setOffset(obstacle.width * 0.35, obstacle.height * 0.6); // Trunk only
    } else if (type === 'turtle') {
        obstacle.setScale(0.06); // Reduced scale
        obstacle.body.setCircle(obstacle.width * 0.25);
    } else if (type === 'tumbleweed') {
        obstacle.setScale(0.08); // Increased scale
        obstacle.body.setCircle(obstacle.width * 0.3); // Reduced collision (was 0.4)
    } else { // Rock
        obstacle.setScale(0.05);
        obstacle.body.setSize(obstacle.width * 0.7, obstacle.height * 0.6);
    }
    
    // 2. Movement
    if (type === 'tumbleweed') {
        const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
        const moveSpeed = Phaser.Math.Between(30, 80); 
        
        obstacle.setVelocityX(moveSpeed * direction);
        obstacle.setAngularVelocity(Phaser.Math.Between(100, 300) * direction);
    } else if (type === 'turtle') {
        // Turtles crawl slowly
        const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
        obstacle.setVelocityX(10 * direction);
    } else {
        // Static obstacles
        obstacle.setVelocityX(0);
    }
}

function hitObstacle(playerOrTrailer, obstacle) {
    this.physics.pause();
    gameOver = true;
    playerOrTrailer.setTint(0xff0000);
    
    // Stop engine sound
    if (engineSound) {
        engineSound.frequency.value = 0; 
    }
    if (ufoGainNode) {
        ufoGainNode.gain.value = 0;
    }

    // Play crash sound
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext && engineSound) {
        const ctx = engineSound.context; // Use same context
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.5); // Pitch drop
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    }
    
    // Check High Score
    checkHighScore();
}

function checkHighScore() {
    // Minimum score to even prompt
    if (score < 1000) {
        showGameOverScreen();
        return;
    }

    // Check if score qualifies for top 10
    let qualifies = false;
    if (highScores.length < 10) {
        qualifies = true;
    } else {
        // Check if better than the lowest score
        const lowest = highScores[highScores.length - 1].score;
        if (score > lowest) {
            qualifies = true;
        }
    }

    if (qualifies) {
        // Show Input Form
        document.getElementById('highscore-form').style.display = 'block';
        document.getElementById('initials').value = '';
        document.getElementById('initials').focus();
        
        scoreText.setText('NEW HIGH SCORE: ' + score);
    } else {
        // Just show game over and list
        showGameOverScreen();
    }
}

function showGameOverScreen() {
    let listText = 'HIGH SCORES\n\n';
    highScores.sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < Math.min(highScores.length, 10); i++) {
        listText += (i+1) + '. ' + highScores[i].name + ' - ' + highScores[i].score + '\n';
    }
    
    listText += '\nPress SPACE to restart';
    
    highScoreText.setText(listText);
    highScoreText.setVisible(true);
    
    scoreText.setText('CRASH! Final Score: ' + score);
}

function submitHighScore() {
    const initials = document.getElementById('initials').value.toUpperCase();
    if (initials.length > 0) {
        highScores.push({ name: initials, score: score });
        // Sort and trim
        highScores.sort((a, b) => b.score - a.score);
        highScores = highScores.slice(0, 10); // Keep top 10
        
        // Save
        localStorage.setItem('highScores', JSON.stringify(highScores));
        
        // Hide form
        document.getElementById('highscore-form').style.display = 'none';
        
        // Show list
        showGameOverScreen();
    }
}

// Allow skipping high score entry
function skipHighScore() {
    document.getElementById('highscore-form').style.display = 'none';
    showGameOverScreen();
}

function restartGame(scene) {
    gameOver = false;
    score = 0;
    
    // Restart engine sound
    if (engineSound) {
        engineSound.frequency.value = 60;
    }
    
    multiplierText.setVisible(false);
    multiplierText.setText('');
    highScoreText.setVisible(false);
    
    car.clearTint();
    trailer.clearTint();
    
    car.setPosition(240, 400);
    trailer.setPosition(240, 500);
    
    obstacles.clear(true, true);
    
    ufoActive = false;
    ufo.setVisible(false);
    ufoBeam.clear();
    ufoState = 'idle';

    scene.physics.resume();
    
    scoreText.setText('Score: 0');
    scoreText.setStyle({ fill: '#ffffff' });
}
