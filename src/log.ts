export function printLog(verbose: number) {
    return (level: number, message: string) => {
        if (verbose >= level)
            console.log(`LOG: ${message}`);
    };
}
