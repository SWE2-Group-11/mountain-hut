/**
 * Returns the given date as YYYY-MM-DD in the server's local time zone.
 */
export const toLocalDate = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // getMonth() is 0-based
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

/**
 * Converts a HH:mm time into the number of minutes since midnight.
 */
export const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
};

/**
 * Converts a number of minutes since midnight into a HH:mm time.
 */
export const minutesToTime = (minutes: number): string => {
    const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
    const remainder = String(minutes % 60).padStart(2, "0");
    return `${hours}:${remainder}`;
};