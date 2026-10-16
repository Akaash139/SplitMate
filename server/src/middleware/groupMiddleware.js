const mongoose = require("mongoose");
const Group = require("../models/Group");

/**
 * Middleware: Verify that the requesting authenticated user is an active member of the group
 */
async function requireGroupMember(req, res, next) {
  try {
    const groupId = req.params.id || req.params.groupId;

    if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid group identifier"
      });
    }

    const group = await Group.findById(groupId)
      .populate("members.user", "name email avatar")
      .populate("creator", "name email avatar");

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found"
      });
    }

    // Check membership
    const isMember = group.isMember(req.user._id);
    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: "Access denied. You are not a member of this group"
      });
    }

    const memberRecord = group.members.find(
      (m) => m.user._id.toString() === req.user._id.toString()
    );

    req.group = group;
    req.userGroupRole = memberRecord ? memberRecord.role : "member";

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: Verify that the member has administrative or creator privileges
 */
function requireGroupAdminOrCreator(req, res, next) {
  if (!req.group) {
    return res.status(500).json({
      success: false,
      error: "Group access check must run before role verification"
    });
  }

  const hasPermission = req.group.isCreatorOrAdmin(req.user._id);
  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      error: "Permission denied. Only group creator or admins can perform this action"
    });
  }

  next();
}

/**
 * Middleware: Verify that the user is the original creator of the group
 */
function requireGroupCreator(req, res, next) {
  if (!req.group) {
    return res.status(500).json({
      success: false,
      error: "Group access check must run before role verification"
    });
  }

  const creatorId = req.group.creator._id
    ? req.group.creator._id.toString()
    : req.group.creator.toString();

  if (creatorId !== req.user._id.toString()) {
    return res.status(403).json({
      success: false,
      error: "Permission denied. Only the group creator can perform this action"
    });
  }

  next();
}

module.exports = {
  requireGroupMember,
  requireGroupAdminOrCreator,
  requireGroupCreator
};
