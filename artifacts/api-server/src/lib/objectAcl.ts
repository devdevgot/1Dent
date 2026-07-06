import type { StoredObject } from "./storedObject";

const ACL_POLICY_METADATA_KEY_GCS = "custom:aclPolicy";
const ACL_POLICY_METADATA_KEY_R2 = "acl-policy";

export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

function readAclFromMetadata(customMetadata?: Record<string, string>): ObjectAclPolicy | null {
  if (!customMetadata) return null;
  const raw =
    customMetadata[ACL_POLICY_METADATA_KEY_GCS] ??
    customMetadata[ACL_POLICY_METADATA_KEY_R2] ??
    customMetadata["acl-policy"];
  if (!raw) return null;
  return JSON.parse(raw) as ObjectAclPolicy;
}

export async function setObjectAclPolicy(
  object: StoredObject,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  if (!(await object.exists())) {
    throw new Error(`Object not found: ${object.key}`);
  }

  await object.setCustomMetadata({
    [ACL_POLICY_METADATA_KEY_R2]: JSON.stringify(aclPolicy),
  });
}

export async function getObjectAclPolicy(
  object: StoredObject,
): Promise<ObjectAclPolicy | null> {
  const metadata = await object.getMetadata();
  return readAclFromMetadata(metadata.customMetadata);
}

export async function canAccessObject({
  userId,
  object,
  requestedPermission,
}: {
  userId?: string;
  object: StoredObject;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(object);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
