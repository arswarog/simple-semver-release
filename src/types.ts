export interface ICommit {
    type: string;
    scope: string;
    subject: string;
    merge: null,
    header: string;
    body: string;
    footer: string
    notes: { title: string, text: string }[];
    references: any[],
    mentions: any[],
    revert: null,
    hash: string;
    gitTags: string;
    committerDate: string;
}
