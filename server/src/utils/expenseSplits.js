/**
 * Pure, reusable split calculation engine for SplitMate.
 * 
 * Provides deterministic arithmetic using integer currency minor units (paise for INR).
 * Free from database or HTTP/Express dependencies.
 */

const CURRENCY_MINOR_MULTIPLIER = 100; // 1 INR = 100 Paise
const PERCENTAGE_SUM_TOLERANCE = 0.001; // Allowable floating-point difference for 100%

/**
 * Converts a rupee amount to integer paise.
 * Rejects non-finite, negative, zero (unless allowZero is true), or amounts with more than 2 decimal places.
 *
 * @param {number} amount
 * @param {object} [options]
 * @param {boolean} [options.allowZero=false]
 * @returns {number} Integer paise
 */
function toPaise(amount, { allowZero = false } = {}) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new Error(`Invalid monetary amount: expected finite number, received ${amount}`);
  }

  if (amount < 0) {
    throw new Error(`Invalid monetary amount: cannot be negative (${amount})`);
  }

  if (!allowZero && amount === 0) {
    throw new Error("Invalid monetary amount: must be greater than zero");
  }

  // Check for fractional paise (more than 2 decimal places)
  // e.g. 10.555 * 100 = 1055.5
  const scaled = amount * CURRENCY_MINOR_MULTIPLIER;
  const rounded = Math.round(scaled);

  if (Math.abs(scaled - rounded) > 1e-5) {
    throw new Error(`Invalid monetary amount: cannot have fractions of a paisa (${amount})`);
  }

  return rounded;
}

/**
 * Converts integer paise back to rupees with two decimal places.
 *
 * @param {number} paise
 * @returns {number} Rupee amount (e.g. 33.34)
 */
function fromPaise(paise) {
  if (typeof paise !== "number" || !Number.isFinite(paise)) {
    throw new Error(`Invalid paise: expected finite number, received ${paise}`);
  }
  return Number((paise / CURRENCY_MINOR_MULTIPLIER).toFixed(2));
}

/**
 * Extracts a normalized string ID from a user object or string ID.
 *
 * @param {string|object} participant
 * @returns {string} Normalized string ID
 */
function getParticipantId(participant) {
  if (!participant) {
    throw new Error("Invalid participant: participant identifier is required");
  }

  if (typeof participant === "string") {
    const trimmed = participant.trim();
    if (!trimmed) throw new Error("Invalid participant: empty participant ID");
    return trimmed;
  }

  if (typeof participant === "object") {
    // Support MongoDB ObjectId or objects with user, userId, or _id
    if (participant._id) return participant._id.toString();
    if (participant.user) {
      return typeof participant.user === "object"
        ? participant.user._id?.toString() || participant.user.toString()
        : participant.user.toString();
    }
    if (participant.userId) return participant.userId.toString();
    if (participant.id) return participant.id.toString();
    if (typeof participant.toString === "function") {
      const str = participant.toString();
      if (str && str !== "[object Object]") return str;
    }
  }

  throw new Error("Invalid participant: unable to resolve participant ID");
}

/**
 * Validates and deduplicates a list of participants.
 *
 * @param {Array<string|object>} participants
 * @returns {string[]} Array of normalized unique participant IDs
 */
function validateParticipants(participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new Error("Participants list cannot be empty");
  }

  const seen = new Set();
  const normalizedIds = [];

  for (let i = 0; i < participants.length; i++) {
    const id = getParticipantId(participants[i]);
    if (seen.has(id)) {
      throw new Error(`Duplicate participant detected: ${id}`);
    }
    seen.add(id);
    normalizedIds.push(id);
  }

  return normalizedIds;
}

/**
 * EQUAL SPLIT
 * Divides the total amount among participants and distributes leftover paise deterministically
 * to the first participants in the list so that the sum of allocations equals the total exactly.
 *
 * @param {number} totalAmount - Total expense in rupees (e.g. 100)
 * @param {Array<string|object>} participants - Array of participant IDs or objects
 * @returns {object} Calculated splits result
 */
function splitEqual(totalAmount, participants) {
  const totalPaise = toPaise(totalAmount);
  const participantIds = validateParticipants(participants);
  const count = participantIds.length;

  const basePaise = Math.floor(totalPaise / count);
  const leftoverPaise = totalPaise % count;

  const splits = participantIds.map((userId, index) => {
    // Deterministic distribution: first `leftoverPaise` participants receive +1 paisa
    const allocatedPaise = basePaise + (index < leftoverPaise ? 1 : 0);
    return {
      user: userId,
      amount: fromPaise(allocatedPaise),
      amountPaise: allocatedPaise
    };
  });

  return {
    totalAmount: fromPaise(totalPaise),
    totalPaise,
    splitType: "equal",
    splits
  };
}

/**
 * EXACT SPLIT
 * Accepts specific amounts per participant. Validates that amounts are non-negative,
 * all participants are unique, and the sum of allocations strictly matches the total in paise.
 *
 * @param {number} totalAmount - Total expense in rupees
 * @param {Array<{user: string|object, amount: number}>} splitDetails - Array of allocations
 * @returns {object} Calculated splits result
 */
function splitExact(totalAmount, splitDetails) {
  const totalPaise = toPaise(totalAmount);

  if (!Array.isArray(splitDetails) || splitDetails.length === 0) {
    throw new Error("Exact split details cannot be empty");
  }

  // Validate participants and check for duplicates
  const participantIds = validateParticipants(splitDetails.map((s) => s?.user));

  let allocatedSumPaise = 0;
  const splits = [];

  for (let i = 0; i < splitDetails.length; i++) {
    const item = splitDetails[i];
    const userId = participantIds[i];

    if (item.amount === undefined || item.amount === null) {
      throw new Error(`Missing exact allocation amount for participant ${userId}`);
    }

    const itemPaise = toPaise(item.amount, { allowZero: true });
    allocatedSumPaise += itemPaise;

    splits.push({
      user: userId,
      amount: fromPaise(itemPaise),
      amountPaise: itemPaise,
      exactAmount: fromPaise(itemPaise)
    });
  }

  if (allocatedSumPaise !== totalPaise) {
    const diff = Math.abs(totalPaise - allocatedSumPaise);
    const direction = allocatedSumPaise < totalPaise ? "under" : "over";
    throw new Error(
      `Exact allocations sum to ₹${(allocatedSumPaise / CURRENCY_MINOR_MULTIPLIER).toFixed(2)}, which does not equal the expense total of ₹${(totalPaise / CURRENCY_MINOR_MULTIPLIER).toFixed(2)} (${direction} by ₹${(diff / CURRENCY_MINOR_MULTIPLIER).toFixed(2)})`
    );
  }

  return {
    totalAmount: fromPaise(totalPaise),
    totalPaise,
    splitType: "exact",
    splits
  };
}

/**
 * PERCENTAGE SPLIT
 * Accepts percentages per participant. Requires percentages to sum to 100%.
 * Allocations in paise are calculated using the Largest Remainder (Hare-Niemeyer) method:
 * 1. Calculate exact fractional paise for each participant.
 * 2. Assign the integer floor of paise to each participant.
 * 3. Distribute the remaining paise (1 paisa each) to participants in order of their fractional remainders.
 * 4. Ties in fractional remainder are resolved deterministically using initial list order.
 *
 * @param {number} totalAmount - Total expense in rupees
 * @param {Array<{user: string|object, percentage: number}>} splitDetails - Array of percentages
 * @returns {object} Calculated splits result
 */
function splitPercentage(totalAmount, splitDetails) {
  const totalPaise = toPaise(totalAmount);

  if (!Array.isArray(splitDetails) || splitDetails.length === 0) {
    throw new Error("Percentage split details cannot be empty");
  }

  // Validate participants and check for duplicates
  const participantIds = validateParticipants(splitDetails.map((s) => s?.user));

  let totalPercentage = 0;
  const intermediate = [];

  for (let i = 0; i < splitDetails.length; i++) {
    const item = splitDetails[i];
    const userId = participantIds[i];

    if (item.percentage === undefined || item.percentage === null) {
      throw new Error(`Missing percentage for participant ${userId}`);
    }

    if (typeof item.percentage !== "number" || !Number.isFinite(item.percentage)) {
      throw new Error(`Invalid percentage for participant ${userId}: expected finite number`);
    }

    if (item.percentage < 0) {
      throw new Error(`Percentage cannot be negative for participant ${userId} (${item.percentage}%)`);
    }

    if (item.percentage > 100) {
      throw new Error(`Percentage cannot exceed 100% for participant ${userId} (${item.percentage}%)`);
    }

    totalPercentage += item.percentage;

    // Calculate exact fractional paise
    const exactPaise = (totalPaise * item.percentage) / 100;
    const floorPaise = Math.floor(exactPaise);
    const remainder = exactPaise - floorPaise;

    intermediate.push({
      user: userId,
      percentage: item.percentage,
      exactPaise,
      floorPaise,
      remainder,
      originalIndex: i
    });
  }

  // Validate that percentages sum to 100% within tolerance
  if (Math.abs(totalPercentage - 100) > PERCENTAGE_SUM_TOLERANCE) {
    throw new Error(
      `Percentages must total 100%. Current total is ${Number(totalPercentage.toFixed(4))}%`
    );
  }

  // Calculate sum of floored paise and determine leftover paise
  const allocatedFloorSum = intermediate.reduce((sum, item) => sum + item.floorPaise, 0);
  let leftoverPaise = totalPaise - allocatedFloorSum;

  // Sort by fractional remainder descending; tiebreak by original index
  const sorted = [...intermediate].sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-9) {
      return b.remainder - a.remainder;
    }
    return a.originalIndex - b.originalIndex;
  });

  const bonusPaiseMap = new Map();
  for (let i = 0; i < sorted.length && leftoverPaise > 0; i++) {
    bonusPaiseMap.set(sorted[i].user, 1);
    leftoverPaise--;
  }

  // Restore original ordering
  const splits = intermediate.map((item) => {
    const bonus = bonusPaiseMap.get(item.user) || 0;
    const finalPaise = item.floorPaise + bonus;
    return {
      user: item.user,
      amount: fromPaise(finalPaise),
      amountPaise: finalPaise,
      percentage: item.percentage
    };
  });

  return {
    totalAmount: fromPaise(totalPaise),
    totalPaise,
    splitType: "percentage",
    splits
  };
}

/**
 * Universal split calculation entry point.
 *
 * @param {object} params
 * @param {number} params.totalAmount - Total amount in rupees
 * @param {"equal"|"exact"|"percentage"} [params.splitType="equal"] - Split strategy
 * @param {Array<string|object>} [params.participants] - Required for equal split
 * @param {Array<object>} [params.splits] - Required for exact and percentage splits
 * @returns {object} Calculated splits result
 */
function calculateSplits({ totalAmount, splitType = "equal", participants, splits }) {
  switch (splitType) {
    case "equal": {
      const targetParticipants = participants || splits?.map((s) => s.user);
      return splitEqual(totalAmount, targetParticipants);
    }
    case "exact": {
      return splitExact(totalAmount, splits);
    }
    case "percentage": {
      return splitPercentage(totalAmount, splits);
    }
    default:
      throw new Error(`Unsupported split type: "${splitType}". Must be equal, exact, or percentage.`);
  }
}

module.exports = {
  CURRENCY_MINOR_MULTIPLIER,
  PERCENTAGE_SUM_TOLERANCE,
  toPaise,
  fromPaise,
  getParticipantId,
  validateParticipants,
  splitEqual,
  splitExact,
  splitPercentage,
  calculateSplits
};
