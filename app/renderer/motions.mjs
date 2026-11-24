const tau = Math.PI * 2;
const cos = Math.cos;
const sin = Math.sin;
const smooth = (value) => value * value * (3 - 2 * value);
const pulse = (p) => sin(Math.PI * p);

export const durations = Object.freeze({
  pat: 870, poke: 580, feed: 1650, wave: 1750, stretch: 2000, twirl: 1050,
  celebrate: 1360, launch: 650, settle: 520, peek: 760, wake: 620, error: 820, waiting: 720,
});

export function basePose(seconds, gaze, frame, phase, blink) {
  const sway = sin(seconds * 2.6);
  const step = frame.moving ? sin(seconds * 13) : 0;
  const pose = {
    yaw: gaze.x * 17 + (frame.moving * 8),
    pitch: gaze.y * 9,
    roll: sway * 1.4 + frame.peek * 10,
    eyes: blink,
    pupilX: gaze.x * 0.9,
    pupilY: gaze.y * 0.7,
    mouth: 0,
    breath: 0.5 - cos(seconds * 2.3) * 0.5,
    hair: sin(seconds * 2.4 + 0.6) * 0.16 + step * 0.35,
    wings: sway * 0.13 + step * 0.15,
    armL: -step * 0.16,
    armR: step * 0.16,
    step,
    angle: frame.drag ? sway * 5.5 : frame.air ? frame.flight * 25 : frame.peek * 9,
    x: frame.peek * -4,
    y: -Math.abs(step) * 4,
    scaleX: 1,
    scaleY: 1,
  };

  if (phase === 'thinking') {
    pose.roll += -5 + sin(seconds * 1.6) * 3;
    pose.pitch += 5;
  } else if (phase === 'reading') {
    pose.pupilX = sin(seconds * 4) * 0.95;
    pose.pitch -= 8;
  } else if (phase === 'editing') {
    pose.armL += 0.15 + sin(seconds * 11) * 0.09;
    pose.armR += 0.15 - sin(seconds * 11) * 0.09;
  } else if (phase === 'running') {
    pose.wings += sin(seconds * 9) * 0.43;
    pose.hair += sin(seconds * 6) * 0.31;
  } else if (phase === 'waiting') {
    pose.pitch += 8;
    pose.pupilX *= 0.3;
    pose.mouth = 0.15;
  }
  if (frame.air || frame.drag) {
    pose.hair += sin(seconds * 10) * 0.32 + frame.flight * 0.54;
    pose.wings += sin(seconds * 11) * 0.45;
    pose.armL += 0.42;
    pose.armR += 0.42;
    pose.mouth = 0.57;
  }
  if (frame.sleeping) {
    pose.eyes = 0;
    pose.pitch = -14;
    pose.roll += 6;
    pose.angle += 7;
    pose.y += 5;
    pose.scaleY = 0.96 + pose.breath * 0.035;
  }
  return pose;
}

export function applyAction(pose, action, p) {
  const strength = pulse(p);
  const lift = Math.min(1, p * 5, (1 - p) * 5);
  switch (action) {
    case 'pat':
      pose.eyes = Math.min(pose.eyes, 1 - strength);
      pose.pitch -= strength * 10;
      pose.scaleY -= strength * 0.08;
      pose.scaleX += strength * 0.063;
      pose.y += strength * 6;
      break;
    case 'poke':
      pose.angle += sin(p * tau * 2) * (1 - p) * 12;
      pose.scaleX -= strength * 0.09;
      pose.mouth = strength * 0.45;
      break;
    case 'feed':
      pose.armR += strength * 0.52;
      pose.mouth = lift * (0.18 + Math.abs(sin(p * tau * 4)) * 0.82);
      pose.pitch -= strength * 12;
      pose.eyes = Math.min(pose.eyes, 1 - strength * 0.7);
      break;
    case 'wave':
      pose.armR += lift * (0.87 + sin(p * tau * 4) * 0.12);
      pose.roll += strength * 6;
      pose.mouth = strength * 0.48;
      pose.wings += sin(p * tau * 2) * lift * 0.25;
      break;
    case 'stretch':
      pose.armL += strength * 0.94;
      pose.armR += strength * 0.94;
      pose.pitch += strength * 11;
      pose.scaleY += strength * 0.08;
      pose.eyes = Math.min(pose.eyes, 1 - strength * 0.9);
      pose.mouth = strength * 0.7;
      break;
    case 'twirl':
      pose.angle += smooth(p) * 360;
      pose.y -= strength * 9;
      pose.hair += strength * 0.65;
      pose.wings += strength * 0.5;
      break;
    case 'celebrate':
      pose.y -= Math.abs(sin(p * tau)) * strength * 24;
      pose.armL += strength * 0.76;
      pose.armR += strength * 0.86;
      pose.mouth = strength * 0.9;
      pose.wings += strength * 0.57;
      break;
    case 'launch':
      pose.mouth = strength * 0.9;
      pose.hair += strength * 0.6;
      break;
    case 'settle':
      pose.scaleY -= strength * 0.14;
      pose.scaleX += strength * 0.11;
      pose.y += strength * 8;
      break;
    case 'peek':
    case 'waiting':
      pose.pitch += strength * 10;
      pose.mouth = strength * 0.35;
      break;
    case 'wake':
      pose.y -= strength * 9;
      pose.pitch += strength * 13;
      pose.mouth = strength * 0.93;
      break;
    case 'error':
      pose.angle += sin(p * tau * 3) * (1 - p) * 8;
      pose.mouth = strength * 0.56;
      pose.eyes = Math.min(pose.eyes, 1 - strength * 0.43);
      break;
  }
  return pose;
}

export function applyParameters(model, pose) {
  model.setParameter('ParamAngleX', pose.yaw);
  model.setParameter('ParamAngleY', pose.pitch);
  model.setParameter('ParamAngleZ', pose.roll);
  model.setParameter('ParamEyeLOpen', pose.eyes);
  model.setParameter('ParamEyeROpen', pose.eyes);
  model.setParameter('ParamEyeBallX', pose.pupilX);
  model.setParameter('ParamEyeBallY', pose.pupilY);
  model.setParameter('ParamMouthOpenY', pose.mouth);
  model.setParameter('ParamBreath', pose.breath);
  model.setParameter('ParamHairSwing', pose.hair);
  model.setParameter('ParamWing', pose.wings);
  model.setParameter('ParamArmL', pose.armL);
  model.setParameter('ParamArmR', pose.armR);
  model.setParameter('ParamStep', pose.step);
}
