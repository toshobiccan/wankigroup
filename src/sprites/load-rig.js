export function validateRig(rig) {
  if (!Array.isArray(rig?.bones) || rig.bones.length === 0) {
    throw new Error("A rig needs at least one bone");
  }

  const byId = new Map();
  for (const bone of rig.bones) {
    if (!bone?.id) throw new Error("Every bone needs an id");
    if (byId.has(bone.id)) throw new Error(`Duplicate bone id: ${bone.id}`);
    if (bone.zIndex !== undefined && !Number.isFinite(bone.zIndex)) {
      throw new Error(`Bone '${bone.id}' has a non-numeric zIndex`);
    }
    byId.set(bone.id, { ...bone, parent: bone.parent ?? null });
  }

  for (const bone of byId.values()) {
    if (bone.parent && !byId.has(bone.parent)) {
      throw new Error(`Unknown parent '${bone.parent}' for bone '${bone.id}'`);
    }
  }

  for (const [slotId, slot] of Object.entries(rig.slots ?? {})) {
    if (!Array.isArray(slot.attachments) || slot.attachments.length === 0) {
      throw new Error(`Equipment slot '${slotId}' needs attachments`);
    }
    for (const attachment of slot.attachments) {
      if (!byId.has(attachment.bone)) throw new Error(`Equipment slot '${slotId}' targets unknown bone '${attachment.bone}'`);
      if (!["overlay", "replace"].includes(attachment.mode)) throw new Error(`Equipment slot '${slotId}' has invalid mode`);
      if (!["rear", "armor", "front", "effects"].includes(attachment.layer)) throw new Error(`Equipment slot '${slotId}' has invalid layer`);
    }
  }

  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error("Rig hierarchy contains a cycle");
    visiting.add(id);
    const bone = byId.get(id);
    if (bone.parent) visit(bone.parent);
    visiting.delete(id);
    visited.add(id);
    ordered.push(bone);
  }

  for (const id of byId.keys()) visit(id);
  return { ...rig, bones: ordered };
}

export function validateClips(rig, clips = {}) {
  const rigBones = new Set(validateRig(rig).bones.map((bone) => bone.id));
  for (const [clipId, clip] of Object.entries(clips)) {
    if (!Number.isFinite(clip?.durationMs) || clip.durationMs <= 0) throw new Error(`Clip '${clipId}' needs a positive durationMs`);
    for (const [boneId, track] of Object.entries(clip.tracks ?? {})) {
      if (!rigBones.has(boneId)) throw new Error(`Clip '${clipId}' targets unknown bone '${boneId}'`);
      let previousTime = -1;
      for (const keyframe of track) {
        if (!Number.isFinite(keyframe.time) || keyframe.time < 0 || keyframe.time > 1 || keyframe.time < previousTime) {
          throw new Error(`Clip '${clipId}' keyframes must be ordered from 0 to 1`);
        }
        previousTime = keyframe.time;
      }
    }
  }
  return clips;
}
