function digitsOfCardNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

module.exports = digitsOfCardNumber;
