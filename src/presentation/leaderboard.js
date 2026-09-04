export function createLeaderboardItem(documentRef, entity, rank, percentage) {
    const li = documentRef.createElement('li');

    if (entity.id === 'player') {
        li.classList.add('me');
    }

    li.style.color = entity.color;

    const nameSpan = documentRef.createElement('span');
    nameSpan.className = 'leaderboard-name';
    const label = entity.icon ? `${entity.icon} ${entity.name}` : entity.name;
    nameSpan.textContent = `${rank}. ${label}`;

    const percentageSpan = documentRef.createElement('span');
    percentageSpan.textContent = `${percentage}%`;

    li.appendChild(nameSpan);
    li.appendChild(percentageSpan);

    return li;
}
