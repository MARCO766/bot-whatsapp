async function esperarSegundos(segundos) {
  return new Promise(resolve => {
    setTimeout(resolve, segundos * 1000);
  });
}

module.exports = {
  esperarSegundos
};