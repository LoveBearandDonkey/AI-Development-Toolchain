(() => {
  'use strict';

  document.querySelectorAll('[data-expression-caption]').forEach((node, index) => {
    const expression = window.CATALOG_MATH_EXPRESSIONS?.[index];
    if (expression) node.textContent = expression.caption;
  });

  const transitionRecord = document.querySelector('[data-transition-record]');
  if (transitionRecord && window.CATALOG_TRANSITION_LINES) {
    const records = window.CATALOG_TRANSITION_LINES.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    });
    transitionRecord.replaceChildren(...records);
  }

  const headTurn = window.CATALOG_AVATAR_CONFIG?.headTurn;
  if (headTurn) {
    const angle = radians => {
      const degrees = radians * 180 / Math.PI;
      const value = Number(Math.abs(degrees).toFixed(1));
      const sign = degrees < 0 ? '−' : degrees > 0 ? '+' : '';
      return `${sign}${value}°`;
    };
    const steps = [...headTurn.steps, headTurn.release];
    document.querySelectorAll('[data-head-turn-step]').forEach((row, index) => {
      const { start, duration, direction } = steps[index];
      row.cells[1].textContent = `${start.toFixed(2)} 秒`;
      row.cells[2].textContent = `${duration.toFixed(2)} 秒`;
      if (direction !== undefined) {
        row.cells[3].textContent = `${angle(direction * headTurn.yaw)} / ${angle(direction * headTurn.pitch)}`;
      }
    });
  }

  document.querySelectorAll('.face-toggle').forEach(button => {
    const card = button.closest('article');
    const title = card.querySelector('h2, h3').textContent;
    const placement = card.querySelector('.placement').textContent;
    const modeLabel = button.querySelector('.mode-label');
    button.addEventListener('click', () => {
      const enabled = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(enabled));
      modeLabel.textContent = enabled ? '符号融合' : '普通表情';
      button.setAttribute('aria-label', enabled
        ? `${title}：${placement}，点击查看普通表情`
        : `${title}：普通表情，点击查看符号融合`);
    });
  });
})();
