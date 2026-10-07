function formatCardNumber(digits) {
  return `${digits.slice(0, 5)}-${digits.slice(5, 10)}-${digits.slice(10)}`;
}

module.exports = formatCardNumber;
