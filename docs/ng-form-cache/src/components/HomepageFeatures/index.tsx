import type { ReactNode } from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  imgUrl: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Fully integrated with Angular',
    imgUrl: 'img/angular_logo.png',
    description: (
      <>
        Easy to integrate and use into your Angular application. Just import the providers and you're ready to go.
      </>
    ),
  },
  {
    title: 'Used by professionals',
    imgUrl: 'img/planb_logo.png',
    description: (
      <>
        We at PlanB. GmbH use this library in many projects. So it's well tested and production-ready.
      </>
    ),
  },
];

function Feature({ title, imgUrl, description }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className={styles.containerImg + ' text--center'}>
        <img className={styles.featureSvg} role="img" src={imgUrl} />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
